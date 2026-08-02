/**
 * Ecency Hosting - HBD Payment Listener
 *
 * Monitors the Hive blockchain for HBD transfers to the hosting account
 * and processes subscription payments automatically.
 */

import { callRPC, setNodes } from '@ecency/sdk/hive';
import { db } from './db/client';
import { COMMUNITY_NAME, TenantService } from './services/tenant-service';
import { ConfigService } from './services/config-service';
import { parseMemo, mapTenantFromDb, type ParsedMemo } from './types';
import { AuditService } from './services/audit-service';
import * as Pricing from './pricing';

// Parse the abandoned-tenant grace window from env, failing safe to 7 for any value that is not a
// positive integer. The whole (trimmed) string must be digits — parseInt alone would accept
// partial matches like '13.9' or '7foo', silently bypassing the safe fallback with a truncated
// value. Empty, non-numeric, zero, and negative all fall back to 7. Exported for unit testing.
export function parseAbandonedGraceDays(raw: string | undefined): number {
  const trimmed = (raw ?? '').trim();
  const n = /^\d+$/.test(trimmed) ? parseInt(trimmed, 10) : NaN;
  return Number.isInteger(n) && n > 0 ? n : 7;
}

// Configuration. Payment amounts come from the shared pricing module so the listener validates
// against exactly what every quoting route tells the user to pay.
const CONFIG = {
  PAYMENT_ACCOUNT: Pricing.PAYMENT_ACCOUNT,
  MONTHLY_PRICE_HBD: Pricing.MONTHLY_PRICE_HBD,
  PRO_UPGRADE_PRICE_HBD: Pricing.PRO_UPGRADE_PRICE_HBD,
  CUSTOM_DOMAIN_MONTHLY_PRICE_HBD: Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD,
  HIVE_API_NODES: (process.env.HIVE_API_URL || 'https://api.hive.blog').split(','),
  POLL_INTERVAL_MS: 3000, // 3 seconds (1 block)
  // Days an unpaid (inactive) tenant reserves its username before the sweep reclaims it (marks
  // it 'abandoned'). Must be a positive integer: a zero/negative/NaN value would make the SQL
  // cutoff `NOW() - (n * INTERVAL '1 day')` land at or after now and sweep EVERY inactive tenant,
  // so a misconfigured env falls back to 7 rather than mass-reclaiming.
  ABANDONED_GRACE_DAYS: parseAbandonedGraceDays(process.env.ABANDONED_TENANT_GRACE_DAYS),
};

// Configure hive-tx nodes. setNodes() trims/validates entries and no-ops on an
// empty list, so a misconfigured HIVE_API_URL can't wipe the built-in fallbacks.
setNodes(CONFIG.HIVE_API_NODES);

// How near head replay must be for the abandoned sweep to run (see isCaughtUp). Small enough to
// stay false during a real backlog, loose enough to hold during normal one-block-behind tailing.
const CAUGHT_UP_BLOCK_THRESHOLD = 3;

export class PaymentListener {
  private lastProcessedBlock: number = 0;
  private isRunning: boolean = false;
  private expirationIntervalId: ReturnType<typeof setInterval> | null = null;

  async start() {
    console.log('[PaymentListener] Starting...');
    console.log('[PaymentListener] Monitoring account:', CONFIG.PAYMENT_ACCOUNT);
    console.log('[PaymentListener] Monthly price:', CONFIG.MONTHLY_PRICE_HBD, 'HBD');

    // Get last processed block from DB or use head block minus backfill window
    const lastBlock = await this.getLastProcessedBlock();
    if (lastBlock !== null) {
      this.lastProcessedBlock = lastBlock;
      console.log('[PaymentListener] Resuming from saved block:', this.lastProcessedBlock);
    } else {
      // Start from head block minus some blocks to backfill recent transactions
      const headBlock = await this.getHeadBlockNumber();
      const backfillBlocks = 100; // ~5 minutes of blocks
      this.lastProcessedBlock = Math.max(0, headBlock - backfillBlocks);
      console.log('[PaymentListener] No saved block, starting from:', this.lastProcessedBlock);
    }

    this.isRunning = true;
    this.pollLoop();

    // Sweep expirations at startup (the interval otherwise first fires an hour in, so a
    // just-lapsed subscription would keep serving that whole window) and then hourly. The
    // callback swallows its own errors so one transient DB failure can't become an unhandled
    // rejection that kills the process (and with it the only expiry sweep).
    void this.checkExpirations();
    this.expirationIntervalId = setInterval(() => void this.checkExpirations(), 60 * 60 * 1000);
  }

  async stop() {
    // Clear the expiration check interval
    if (this.expirationIntervalId !== null) {
      clearInterval(this.expirationIntervalId);
      this.expirationIntervalId = null;
    }
    this.isRunning = false;
    console.log('[PaymentListener] Stopped');
  }

  private async pollLoop() {
    while (this.isRunning) {
      try {
        await this.processNewBlocks();
      } catch (error) {
        console.error('[PaymentListener] Error processing blocks:', error);
      }

      await this.sleep(CONFIG.POLL_INTERVAL_MS);
    }
  }

  private async processNewBlocks() {
    const headBlock = await this.getHeadBlockNumber();

    // Process up to 100 blocks at a time to catch up
    const maxBlocks = Math.min(headBlock - this.lastProcessedBlock, 100);

    for (let i = 0; i < maxBlocks; i++) {
      const blockNum = this.lastProcessedBlock + 1;

      try {
        await this.processBlock(blockNum);
        this.lastProcessedBlock = blockNum;
        await this.saveLastProcessedBlock(blockNum);
      } catch (error) {
        console.error('[PaymentListener] Error processing block', blockNum, error);
        break; // Stop and retry this block next iteration
      }
    }

    // Publish a caught-up watermark for the hosting-api. Re-registration of a reclaimed username
    // is gated on this being fresh (see TenantService.create), so that even after the time-based
    // quarantine expires, a listener that is stalled or replaying a backlog — and therefore may not
    // have processed a pending on-chain payment yet — blocks the name from being overwritten. It is
    // written only while genuinely near head; a backlog or a stall leaves it stale.
    if (headBlock - this.lastProcessedBlock <= CAUGHT_UP_BLOCK_THRESHOLD) {
      await this.markCaughtUp();
    }
  }

  private async markCaughtUp(): Promise<void> {
    try {
      await db.query(
        `INSERT INTO system_config (key, value, updated_at)
         VALUES ('payment_listener.caught_up', '1', NOW())
         ON CONFLICT (key) DO UPDATE SET value = '1', updated_at = NOW()`
      );
    } catch (error) {
      // Best-effort heartbeat: a write failure must not break block processing. A stale watermark
      // fails safe (re-registration is blocked), so skipping one write is harmless.
      console.error('[PaymentListener] Error writing caught-up watermark:', (error as Error).message);
    }
  }

  private async processBlock(blockNum: number) {
    const block = await callRPC('condenser_api.get_block', [blockNum]) as any;
    // A null/undefined block means this node doesn't have the block yet (the load-balanced
    // cluster can lag the head-block check by a block or two). Throw so the caller retries
    // the SAME height next tick instead of advancing past it and losing any payment in it.
    if (!block) {
      throw new Error(`Block ${blockNum} not available yet`);
    }
    // A real block always carries a transactions array (possibly empty); no transactions is
    // a valid empty block, so advance past it.
    if (!block.transactions) return;

    // transaction_ids array contains the IDs - tx.transaction_id is undefined
    const transactionIds = (block as any).transaction_ids as string[] | undefined;

    for (let txIndex = 0; txIndex < block.transactions.length; txIndex++) {
      const tx = block.transactions[txIndex];
      const trxId = transactionIds?.[txIndex];

      // Skip if no trx_id available
      if (!trxId) {
        console.log(`[PaymentListener] Missing trx_id for tx at index ${txIndex} in block ${blockNum}`);
        continue;
      }

      for (const op of tx.operations) {
        if (op[0] === 'transfer' && op[1].to === CONFIG.PAYMENT_ACCOUNT) {
          await this.processTransfer({
            trxId,
            blockNum,
            from: op[1].from,
            to: op[1].to,
            amount: op[1].amount,
            memo: op[1].memo,
            timestamp: block.timestamp,
          });
        }
      }
    }
  }

  private async processTransfer(transfer: {
    trxId: string;
    blockNum: number;
    from: string;
    to: string;
    amount: string;
    memo: string;
    timestamp: string;
  }) {
    console.log('[PaymentListener] Processing transfer:', transfer.trxId);

    // Check if already processed
    const existing = await db.queryOne(
      'SELECT id FROM payments WHERE trx_id = $1',
      [transfer.trxId]
    );
    if (existing) {
      console.log('[PaymentListener] Transfer already processed:', transfer.trxId);
      return;
    }

    // Parse amount
    const [amountStr, currency] = transfer.amount.split(' ');
    const amount = parseFloat(amountStr);

    // Only accept HBD
    if (currency !== 'HBD') {
      console.log('[PaymentListener] Ignoring non-HBD transfer:', transfer.amount);
      return;
    }

    // Parse memo
    const parsed = parseMemo(transfer.memo);

    if (parsed.action === 'unknown') {
      console.log('[PaymentListener] Unknown memo format:', transfer.memo);
      await this.logPayment(transfer, amount, 'failed', 0, null, 'Invalid memo format');
      return;
    }

    // Process based on action
    if (parsed.action === 'blog') {
      // For blog subscriptions: validate monthly payment. The custom-domain (':domain') memo is
      // priced at the higher custom-domain monthly rate, so months are derived from that price —
      // an underpaid ':domain' transfer is rejected below rather than silently credited as extra
      // standard months. Integer millis math so an exact payment isn't under-credited by float
      // error (e.g. 0.3/0.1 === 2.9999… → 2), which would then reject a correct blog:name:3 memo.
      const monthlyPrice = parsed.customDomain
        ? CONFIG.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD
        : CONFIG.MONTHLY_PRICE_HBD;
      const amountMillis = Math.round(amount * 1000);
      const priceMillis = Math.round(monthlyPrice * 1000);
      const monthsFromAmount = priceMillis > 0 ? Math.floor(amountMillis / priceMillis) : 0;

      if (monthsFromAmount < 1) {
        console.log('[PaymentListener] Insufficient amount:', amount, 'HBD for', parsed.username);
        await this.logPayment(transfer, amount, 'failed', 0, null, 'Insufficient amount for subscription');
        return;
      }

      // If user requested more months than they paid for, reject
      if (parsed.months > monthsFromAmount) {
        console.log(
          '[PaymentListener] Requested months exceed payment:',
          parsed.months,
          'requested but only',
          monthsFromAmount,
          'paid for',
          parsed.username
        );
        await this.logPayment(
          transfer,
          amount,
          'failed',
          0,
          null,
          `Requested ${parsed.months} months but only paid for ${monthsFromAmount}`
        );
        return;
      }

      // Grant only the months that were paid for
      const months = monthsFromAmount;
      await this.processSubscription(transfer, parsed.username, months, amount, parsed.customDomain);
    } else if (parsed.action === 'upgrade') {
      // The amount is validated inside processUpgrade against the PRORATED custom-domain cost
      // (which depends on the tenant's remaining term). No flat pre-gate here: a flat
      // PRO_UPGRADE_PRICE_HBD floor could reject a correctly-quoted prorated transfer whenever the
      // per-month premium is below that floor.
      await this.processUpgrade(transfer, parsed.username, amount);
    }
  }

  private async processSubscription(
    transfer: any,
    username: string,
    months: number,
    amount: number,
    // A ':domain' memo activates on the custom-domain ('pro') tier. Set the plan on activation so a
    // one-step blog:name:months:domain payment both creates/extends the blog AND unlocks custom
    // domains. A standard memo passes false and never downgrades an existing pro tenant.
    pro: boolean = false
  ) {
    console.log('[PaymentListener] Processing subscription:', username, 'for', months, 'months');

    let updatedTenant: any = null;

    try {
      // Everything that mutates state runs on the SAME transaction client so the payment
      // dedup row and the subscription extension commit or roll back together. This is what
      // makes a retry safe: a transient failure after activation rolls the extension back
      // WITH the dedup row, so reprocessing extends exactly once (no double-credit).
      updatedTenant = await db.transaction(async (client) => {
        // 1. Lock the target tenant row FIRST — before any other await. The abandoned sweep
        // takes the same row lock to flip status to 'abandoned', so the two serialize: if we
        // win, the sweep re-evaluates its 'inactive' predicate against the now-active row and
        // skips it; if the sweep won, we find the surviving 'abandoned' row here and revive it.
        // Either way the payment lands on the ORIGINAL row, keeping its owner + config intact.
        //
        // Note this path never assigns ownership to the payer: an existing row (inactive or
        // abandoned) is activated under its stored owner, and a brand-new row (step 3) is created
        // with owner = username. An HBD transfer is thus gift-style — it activates the named blog
        // under its existing owner — while an actual ownership change goes through create/subscribe
        // (which runs ownership validation). This is exactly why reviving beats recreating: a
        // recreate would reset a community's owner to the community account and orphan it.
        let row = (
          await client.query(`SELECT * FROM tenants WHERE username = $1 FOR UPDATE`, [username])
        ).rows[0];

        // 2. Claim the transfer (dedup via unique trx_id).
        const insertResult = await client.query(
          `INSERT INTO payments
           (tenant_id, trx_id, block_num, from_account, amount, currency, memo, status, months_credited)
           VALUES (NULL, $1, $2, $3, $4, 'HBD', $5, 'processing', $6)
           ON CONFLICT (trx_id) DO NOTHING
           RETURNING id`,
          [transfer.trxId, transfer.blockNum, transfer.from, amount, transfer.memo, months]
        );
        if (insertResult.rows.length === 0) {
          console.log('[PaymentListener] Duplicate transaction detected:', transfer.trxId);
          return null;
        }
        const paymentId = insertResult.rows[0].id;

        // 3. Create the tenant if no row exists at all. The account check + config build happen
        // HERE, inside the transaction, but only for a brand-new tenant. accountExistsStrict
        // THROWS on an RPC outage (transient -> retry) rather than reporting the account absent,
        // so a real payment isn't stranded when a node is down. ON CONFLICT + re-select handles a
        // concurrent create (e.g. the web signup racing us) without failing. An already-existing
        // row — including one the sweep marked 'abandoned' — skips this block and is revived in
        // place by the activation in step 4, preserving its stored owner + config.
        if (!row) {
          // A community instance may only exist if it was reserved through
          // POST /v1/tenants, which verifies the claimed owner administers the
          // community on chain. Auto-creating one here would set owner =
          // username, i.e. the community account itself, and permanently occupy
          // the subdomain: the create upsert only revives an abandoned row or a
          // same-owner inactive one, so the real team could never take it back.
          // A community account IS a real Hive account, so the existence check
          // below does not stop this on its own.
          if (COMMUNITY_NAME.test(username)) {
            throw Object.assign(
              new Error('Community instances must be reserved before payment'),
              { permanent: true }
            );
          }
          if (!(await TenantService.accountExistsStrict(username))) {
            throw Object.assign(new Error('Hive account not found'), { permanent: true });
          }
          const defaultConfig = await TenantService.buildConfig(username);
          const inserted = await client.query(
            `INSERT INTO tenants (username, owner, config, subscription_status, subscription_plan)
             VALUES ($1, $1, $2, 'inactive', 'standard')
             ON CONFLICT (username) DO NOTHING
             RETURNING *`,
            [username, JSON.stringify(defaultConfig)]
          );
          row =
            inserted.rows[0] ??
            (await client.query(`SELECT * FROM tenants WHERE username = $1 FOR UPDATE`, [username]))
              .rows[0];
          console.log('[PaymentListener] Created new tenant:', username);
        }

        // 4. Extend from the later of now / current expiry (same rule as activateSubscription).
        const now = new Date();
        const currentExpiry = row.subscription_expires_at
          ? new Date(row.subscription_expires_at)
          : now;
        const base = currentExpiry > now ? currentExpiry : now;
        const newExpiry = new Date(base);
        newExpiry.setMonth(newExpiry.getMonth() + months);
        const startedAt = row.subscription_started_at || now;

        const activated = await client.query(
          `UPDATE tenants
           SET subscription_status = 'active',
               subscription_started_at = $2,
               subscription_expires_at = $3,
               subscription_plan = COALESCE($4, subscription_plan),
               updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          // COALESCE: a ':domain' payment upgrades to 'pro'; a standard payment ($4 = null) keeps
          // the current plan, so a plain renewal never downgrades a pro tenant to standard.
          [row.id, startedAt, newExpiry, pro ? 'pro' : null]
        );

        // 5. Mark the payment processed in the SAME transaction.
        await client.query(
          `UPDATE payments
           SET tenant_id = $2, status = 'processed', subscription_extended_to = $3
           WHERE id = $1`,
          [paymentId, row.id, newExpiry]
        );

        console.log('[PaymentListener] Subscription activated for', username, 'until', newExpiry);
        return mapTenantFromDb(activated.rows[0]);
      });

      // 5. Post-commit side effects. The payment + activation are ALREADY committed, so a
      // failure here must NOT rethrow into the transient-retry path below: retrying the block
      // would hit the trx_id dedup and skip the transfer, so the config would never be
      // regenerated by this path. A failed write self-heals on the next periodic config sync
      // (which regenerates every active tenant), so log and move on.
      if (updatedTenant) {
        try {
          // Publishes from the row as it stands inside the write lock, which is
          // now a cross-process advisory lock. Passing the snapshot this
          // transaction returned, or even re-reading just before the call,
          // leaves a window where the API can commit and publish an owner's
          // newer config and have this write roll it back.
          await ConfigService.publishConfigFile(username);
        } catch (err) {
          console.error(
            `[PaymentListener] Config generation failed post-commit for ${username} (periodic sync will retry):`,
            (err as Error).message
          );
        }

        void AuditService.log({
          tenantId: updatedTenant.id,
          eventType: 'payment.processed',
          eventData: { username, months, amount, trxId: transfer.trxId },
        });
      }
    } catch (error) {
      // Only a PERMANENT error (genuinely invalid, e.g. no such Hive account) records a
      // 'failed' payment — after which the trx_id dedup means it's never retried. A transient
      // error (RPC/DB outage, or a create racing the signup flow that inserts the tenant
      // between our read and create) must be rethrown WITHOUT a failed row: the transaction
      // has rolled back the 'processing' row, so re-throwing lets the block be retried and the
      // transfer reprocessed cleanly once the condition clears. Recording 'failed' here would
      // strand a real, paid transfer forever.
      if ((error as { permanent?: boolean }).permanent) {
        console.error('[PaymentListener] Permanently rejecting payment for', username, error);
        await this.logPayment(transfer, amount, 'failed', 0, null, String(error));
        return;
      }
      console.error(
        '[PaymentListener] Transient error, will retry block for',
        username,
        (error as Error).message
      );
      throw error;
    }
  }

  private async processUpgrade(transfer: any, username: string, amount: number) {
    console.log('[PaymentListener] Processing upgrade:', username);

    // Result of the transaction, decided inside it and acted on after commit.
    type UpgradeOutcome =
      | { status: 'processed'; tenantId: string }
      | { status: 'failed'; note: string }
      | { status: 'duplicate' };
    let outcome: UpgradeOutcome | null = null;

    try {
      // Everything that mutates state runs on the SAME transaction client so the payment dedup row
      // and the standard->Pro flip commit or roll back together. Splitting them (flip via a
      // separate autocommit, then a separate logPayment) let a single realistic path corrupt the
      // record: if the flip commits and the payment write then fails transiently, the block retries,
      // finds the tenant already Pro, and records the transfer 'failed' — leaving a Pro tenant with
      // a failed payment. Two listeners on the same trx had the same split-brain. One transaction
      // closes both. Mirrors processSubscription.
      outcome = await db.transaction<UpgradeOutcome>(async (client) => {
        // 1. Lock the tenant row FIRST — before any other await — so eligibility can't change under
        // us. The expiry / abandon sweeps take the same row lock, so check-then-flip is atomic
        // without relying on the UPDATE predicate alone.
        const row = (
          await client.query(`SELECT * FROM tenants WHERE username = $1 FOR UPDATE`, [username])
        ).rows[0];

        // 2. Claim the transfer (dedup via unique trx_id). A replayed/duplicate block finds the row
        // already present and bails, so the upgrade is applied at most once.
        const claim = await client.query(
          `INSERT INTO payments
           (tenant_id, trx_id, block_num, from_account, amount, currency, memo, status, months_credited)
           VALUES ($1, $2, $3, $4, $5, 'HBD', $6, 'processing', 0)
           ON CONFLICT (trx_id) DO NOTHING
           RETURNING id`,
          [row?.id ?? null, transfer.trxId, transfer.blockNum, transfer.from, amount, transfer.memo]
        );
        if (claim.rows.length === 0) {
          console.log('[PaymentListener] Duplicate upgrade transaction detected:', transfer.trxId);
          return { status: 'duplicate' };
        }
        const paymentId = claim.rows[0].id;

        // Mark an ineligible/underpaid transfer terminally 'failed' in the SAME transaction — it
        // commits with the claim (so it isn't reprocessed) and no tenant change is made.
        const fail = async (note: string): Promise<UpgradeOutcome> => {
          await client.query(`UPDATE payments SET status = 'failed' WHERE id = $1`, [paymentId]);
          console.log('[PaymentListener] Upgrade not applied for', username, '-', note);
          return { status: 'failed', note };
        };

        // 3. Eligibility, evaluated against the locked row.
        if (!row) return fail('Tenant not found');
        // A custom-domain (Pro) upgrade only applies to a currently-serviceable (active) blog — same
        // rule the x402 /upgrade route enforces. Reject a reserved/inactive, reclaimed/abandoned, or
        // expired tenant: upgrading one would take the payment for a blog that isn't running, and a
        // plan bought while a name was abandoned must not carry over to a later fresh reservation.
        if (row.subscription_status !== 'active') return fail('Tenant not active for upgrade');
        // Already Pro: a repeated or manual upgrade memo would otherwise be taken for a no-op.
        if (row.subscription_plan === 'pro') return fail('Tenant already on Pro plan');

        // Prorated: the owner pays the +1/mo custom-domain premium for the months remaining on their
        // current term (upgrade in place, no term extension). Integer-millis compare so an exact
        // payment isn't rejected by float error. The quote and this validation use the same
        // remainingMonths(); since time only moves forward, remaining only shrinks, so a payment
        // made against the (equal-or-higher) quote is never rejected here.
        const now = new Date();
        const expiresAt = row.subscription_expires_at
          ? new Date(row.subscription_expires_at)
          : null;
        const months = Pricing.remainingMonths(expiresAt, now);
        if (months < 1) {
          // Expiry has passed (active only because the hourly expire sweep hasn't run yet): there is
          // no term to prorate, so don't take the payment for a term-less upgrade.
          return fail('No remaining term to upgrade');
        }
        const required = Pricing.customDomainUpgradeHbd(expiresAt, now);
        if (Math.round(amount * 1000) < Math.round(required * 1000)) {
          return fail(
            `Insufficient for custom-domain upgrade (need ${Pricing.hbd(required)} HBD for ${months} month(s) remaining)`
          );
        }

        // 4. Flip to Pro in place. The predicate re-asserts full eligibility (standard + active +
        // unexpired) as a documented guard; it can't fail here since we hold the row lock and just
        // validated the same conditions, but if it somehow matched nothing we record failed rather
        // than mark a non-upgrade processed.
        const upd = await client.query(
          `UPDATE tenants
              SET subscription_plan = 'pro', updated_at = NOW()
            WHERE id = $1
              AND subscription_plan = 'standard'
              AND subscription_status = 'active'
              AND subscription_expires_at > NOW()
            RETURNING id`,
          [row.id]
        );
        if (upd.rows.length === 0) return fail('Upgrade no longer eligible');

        // 5. Mark the payment processed in the SAME transaction.
        await client.query(`UPDATE payments SET status = 'processed' WHERE id = $1`, [paymentId]);

        console.log('[PaymentListener] Upgraded', username, 'to Pro plan');
        return { status: 'processed', tenantId: row.id };
      });
    } catch (error) {
      // Transient error (RPC/DB): the whole transaction — claim included — rolled back, so no
      // 'processing'/'failed' row persists and the block simply retries. Never record 'failed'
      // here, or the trx_id dedup would strand a real paid upgrade forever.
      console.error(
        '[PaymentListener] Transient error, will retry upgrade for',
        username,
        (error as Error).message
      );
      throw error;
    }

    // Post-commit side effect (audit only). The upgrade + payment are ALREADY committed, so a
    // failure here must not rethrow into the transient-retry path above.
    if (outcome?.status === 'processed') {
      void AuditService.log({
        tenantId: outcome.tenantId,
        eventType: 'payment.upgrade',
        eventData: { username, amount, trxId: transfer.trxId },
      });
    }
  }

  private async logPayment(
    transfer: any,
    amount: number,
    status: string,
    monthsCredited: number,
    subscriptionExtendedTo: Date | null,
    note?: string
  ) {
    const tenant = await TenantService.getByUsername(
      parseMemo(transfer.memo).username
    );

    await db.query(
      `INSERT INTO payments
       (tenant_id, trx_id, block_num, from_account, amount, currency, memo, status, months_credited, subscription_extended_to)
       VALUES ($1, $2, $3, $4, $5, 'HBD', $6, $7, $8, $9)
       ON CONFLICT (trx_id) DO NOTHING`,
      [
        tenant?.id || null,
        transfer.trxId,
        transfer.blockNum,
        transfer.from,
        amount,
        transfer.memo,
        status,
        monthsCredited,
        subscriptionExtendedTo,
      ]
    );
  }

  private async checkExpirations() {
    try {
      console.log('[PaymentListener] Checking subscription expirations...');
      const expired = await TenantService.expireSubscriptions();
      if (expired > 0) {
        console.log('[PaymentListener] Expired', expired, 'subscriptions');
      }

      // Reclaim abandoned signups (created, never paid, past the grace window). This is a SOFT
      // delete — it flips status to 'abandoned' and keeps the row — so a payment still in flight
      // simply revives the surviving row in place on replay/activation, with its original owner +
      // config intact. No served-file cleanup: an abandoned tenant was never activated, and files
      // are only written on activation, so it has none.
      //
      // Gated on the listener being caught up to head, so the reclaim never runs concurrently with
      // a replay backlog (e.g. at startup after downtime). While behind, an on-chain HBD payment
      // for a reservation may sit in a not-yet-replayed block; reclaiming then, with catch-up
      // taking longer than the re-registration quarantine, could free the name before the payment
      // is processed. Waiting until caught up guarantees any such payment has already activated its
      // reservation (so it is not a reclaim target), and the quarantine only ever has to cover the
      // seconds of live tailing, not an unbounded backlog. (Card orders, which have no on-chain
      // signal, are instead protected by the checkout grace-clock refresh in TenantService.create.)
      if (await this.isCaughtUp()) {
        const reclaimed = await TenantService.reclaimAbandonedTenants(CONFIG.ABANDONED_GRACE_DAYS);
        if (reclaimed.length > 0) {
          console.log('[PaymentListener] Reclaimed', reclaimed.length, 'abandoned inactive tenants');
        }
      }
    } catch (error) {
      // Never let a transient DB error escape an interval/void call as an unhandled rejection.
      console.error('[PaymentListener] Expiry check failed:', (error as Error).message);
    }
  }

  private async getHeadBlockNumber(): Promise<number> {
    const props = await callRPC('condenser_api.get_dynamic_global_properties', []) as any;
    return props.head_block_number;
  }

  // Whether block replay has essentially caught up to head. A small tolerance (not exact head) is
  // deliberate: during healthy live tailing the loop trails head by the one block produced each
  // poll interval, so requiring exact equality would seldom hold. When genuinely behind (a startup
  // backlog of thousands of blocks), this is false and the abandoned sweep is deferred. Fails safe
  // to false if head can't be read.
  private async isCaughtUp(): Promise<boolean> {
    try {
      const headBlock = await this.getHeadBlockNumber();
      return headBlock - this.lastProcessedBlock <= CAUGHT_UP_BLOCK_THRESHOLD;
    } catch {
      return false;
    }
  }

  private async getLastProcessedBlock(): Promise<number | null> {
    // Retry the read until the DB answers: a query error (e.g. Postgres not yet accepting
    // connections on a cold stack boot) must NOT be treated as "no saved block", which would
    // resume from head-100 and permanently skip every payment in a longer downtime gap. Only
    // a successful query that returns no/invalid row falls back to backfill (true first boot).
    for (let attempt = 1; ; attempt++) {
      try {
        const result = await db.queryOne<{ value: string }>(
          "SELECT value FROM system_config WHERE key = 'payment_listener.last_block'"
        );
        if (result && result.value) {
          const blockNum = parseInt(result.value, 10);
          if (!isNaN(blockNum) && blockNum > 0) {
            return blockNum;
          }
        }
        return null;
      } catch (error) {
        console.error(
          `[PaymentListener] Error loading last processed block (attempt ${attempt}):`,
          (error as Error).message
        );
        await this.sleep(Math.min(30000, 1000 * attempt));
      }
    }
  }

  private async saveLastProcessedBlock(blockNum: number): Promise<void> {
    try {
      await db.query(
        `INSERT INTO system_config (key, value, updated_at)
         VALUES ('payment_listener.last_block', $1, NOW())
         ON CONFLICT (key)
         DO UPDATE SET value = $1, updated_at = NOW()`,
        [blockNum.toString()]
      );
    } catch (error) {
      console.error('[PaymentListener] Error saving last processed block:', error);
      throw error; // Re-throw to prevent block from being marked as processed
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Start the listener. A boot-time failure (e.g. RPC down while fetching the head block) must
// not crash-loop through the fragile startup path with an unhandled rejection: log and let
// the container's restart policy retry with backoff.
//
// Skipped under Vitest (which sets process.env.VITEST) so a unit test can import this module for
// its pure helpers without opening a block-poll loop or DB/RPC connections. Production is
// unaffected — VITEST is never set there.
if (!process.env.VITEST) {
  const listener = new PaymentListener();
  listener.start().catch((error) => {
    console.error('[PaymentListener] Fatal startup error:', (error as Error).message);
    process.exit(1);
  });

  // Handle graceful shutdown
  process.on('SIGTERM', () => listener.stop());
  process.on('SIGINT', () => listener.stop());
}

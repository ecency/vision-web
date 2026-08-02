/**
 * Internal (service-to-service) routes. NOT public — mounted at /v1/internal and every
 * handler is guarded by the shared HOSTING_INTERNAL_SECRET. Kept separate from the public
 * /v1/payments routes so an internal endpoint can never inherit public middleware or be
 * confused with a customer-facing path.
 */

import { Hono, type Context } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { db } from '../db/client';
import {
  TenantService,
  DomainInUseError,
  ABANDONED_REREGISTER_QUARANTINE_HOURS,
  CAUGHT_UP_SQL,
} from '../services/tenant-service';
import { DomainService } from '../services/domain-service';
import { ConfigService } from '../services/config-service';
import { AuditService, parseClientIp } from '../services/audit-service';
import { mapTenantFromDb, type Tenant } from '../types';
import { addVerifiedDomainOrigin } from '../utils/cors-domains';

export const internalRoutes = new Hono();

const baseDomain = process.env.BASE_DOMAIN || 'blogs.ecency.com';

// Hive-username shape, matching the check used by /activate.
const USERNAME_RE = /^[a-z][a-z0-9.-]{2,15}$/;
// Same domain shape the public /v1/domains route enforces (zod regex, case-insensitive).
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

// Every internal endpoint records its outcome here. These are service-to-service calls with no
// user session, so without a trail the tenants row is the only trace and it cannot say what asked
// for the change: a card-paid activation and a free Pro claim leave an identical `active` row, and
// a denied one leaves nothing at all. Fire-and-forget, exactly like the public routes -- a failed
// audit insert is logged by AuditService and never fails the operation it describes.
function auditInternal(
  c: Context,
  tenantId: string | null | undefined,
  eventType: string,
  eventData: Record<string, unknown>
): void {
  void AuditService.log({
    tenantId: tenantId ?? null,
    eventType,
    eventData,
    ipAddress: parseClientIp(c.req.header('x-forwarded-for')),
    userAgent: c.req.header('user-agent'),
  });
}

/**
 * These routes activate subscriptions, attach custom domains and grant free Pro
 * terms, and the shared secret is the only thing in front of them. JWT_SECRET is
 * already floored at 32 characters; this one had no requirement at all, so a
 * short operator-chosen value was accepted.
 */
export const MIN_INTERNAL_SECRET_LENGTH = 32;

/** The configured secret, or null when it is absent or too weak to accept. */
export function internalSecret(): string | null {
  const secret = process.env.HOSTING_INTERNAL_SECRET || '';
  return secret.length >= MIN_INTERNAL_SECRET_LENGTH ? secret : null;
}

// Constant-time check of the shared service-to-service secret (ePoints -> hosting).
// Fails CLOSED when the secret is unset OR too short, so neither a missing value nor a
// weak one can activate blogs. Rejecting the call rather than refusing to boot keeps an
// otherwise healthy deploy serving the rest of its routes; the startup log distinguishes
// "not configured" from "configured too weakly", which look identical from outside.
export function internalSecretOk(provided: string | undefined): boolean {
  const secret = Buffer.from(internalSecret() ?? '');
  const given = Buffer.from(provided || '');
  // Compared on BYTE length, not string length: timingSafeEqual throws on a
  // mismatch, and two strings of equal length can encode to different byte
  // counts, which would turn a rejected secret into a 500.
  if (secret.length === 0 || given.length !== secret.length) return false;
  return timingSafeEqual(given, secret);
}

// POST /v1/internal/activate - service-to-service activation (NOT public).
// Called by ePoints' fulfillment after a paid card order settles (ePoints is the single
// Stripe brain; hosting never sees card data or Stripe keys). Guarded by a shared secret.
// Idempotent + atomic: dedup on the order id so a fulfillment retry can never double-extend,
// and the payment record + activation commit together so a crash can't leave a paid tenant
// uncredited. Returns 200 on success or benign replay; 404 (permanent) if the tenant is gone
// so ePoints FAILs the order; 5xx (transient) so ePoints leaves it VERIFIED and retries.
internalRoutes.post('/activate', async (c) => {
  if (!internalSecretOk(c.req.header('x-internal-secret'))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const username = String(body?.username || '').toLowerCase();
  // Strict: reject a missing/garbage/out-of-range term rather than silently granting 1 month.
  const monthsRaw = parseInt(body?.months, 10);
  const months = Number.isInteger(monthsRaw) ? monthsRaw : 0;
  const orderId = String(body?.order_id || '').trim();
  const amountUsd = typeof body?.amount_usd === 'number' ? body.amount_usd : 0;
  // Optional tier: 'pro' upgrades the tenant to the Pro plan (custom domains). Anything else
  // leaves the current plan untouched, so a standard renewal never downgrades a Pro tenant.
  const plan = body?.plan === 'pro' ? 'pro' : 'standard';
  // The paying account. `null` ONLY when the field is omitted (the HBD rail has no owner-identity
  // payer, so no check). A PRESENT payer, including an empty string, is enforced below: it must own
  // the tenant, so a card caller cannot skip the ownership boundary by sending an empty value.
  const payer = typeof body?.payer === 'string' ? body.payer.trim().toLowerCase() : null;

  if (!/^[a-z][a-z0-9.-]{2,15}$/.test(username) || months < 1 || months > 24 || !orderId) {
    return c.json({ error: 'invalid_request' }, 400);
  }

  try {
    const result = await db.transaction<{ status: 200 | 403 | 404 | 409; tenantId?: string; duplicate?: boolean; expiresAt?: Date; plan?: string }>(
      async (client) => {
        // Lock the tenant row (serializes retries) and confirm it still exists.
        const t = await client.query(
          `SELECT id, owner, subscription_started_at, subscription_expires_at, subscription_plan
             FROM tenants WHERE username = $1 FOR UPDATE`,
          [username]
        );
        if (t.rowCount === 0) {
          return { status: 404 };
        }
        const tenant = t.rows[0];

        // Payer authorization: a present paying account must be this tenant's owner. A card order
        // activates a tenant different from the payer only for a community the payer owns; anything
        // else (including an empty payer) is refused. Omitted payer (null) means no check.
        if (payer !== null && payer !== tenant.owner) {
          return { status: 403, tenantId: tenant.id };
        }

        // Idempotent Pro upgrade for THIS tenant (a standard activation never touches the plan, so
        // it can never downgrade a Pro tenant). Only ever invoked for an order this tenant owns --
        // gated by the claim / ownership checks below, so a colliding order id can't grant Pro.
        const applyPlan = async (): Promise<string> => {
          if (plan === 'pro' && tenant.subscription_plan !== 'pro') {
            await client.query(
              `UPDATE tenants SET subscription_plan = 'pro', updated_at = NOW() WHERE id = $1`,
              [tenant.id]
            );
            return 'pro';
          }
          return tenant.subscription_plan;
        };

        // Claim the order id.
        const claim = await client.query(
          `INSERT INTO payments
             (tenant_id, trx_id, block_num, from_account, amount, currency, memo, status, months_credited)
           VALUES ($1, $2, 0, 'stripe', $3, 'USD', $4, 'processed', $5)
           ON CONFLICT (trx_id) DO NOTHING
           RETURNING id`,
          [tenant.id, orderId, amountUsd, `blog:${username}:${months}`, months]
        );
        if (claim.rowCount === 0) {
          // Replay: the order id already exists. It must belong to THIS tenant; otherwise it is a
          // collision/misroute and we must not mutate this tenant for an order that isn't theirs.
          const owner = await client.query(
            `SELECT tenant_id FROM payments WHERE trx_id = $1`,
            [orderId]
          );
          if (owner.rows[0]?.tenant_id !== tenant.id) {
            return { status: 409, tenantId: tenant.id };
          }
          // Genuine replay of this tenant's order: re-apply the upgrade idempotently (self-heal
          // after a staggered deploy) without re-extending the term.
          return { status: 200, tenantId: tenant.id, duplicate: true, plan: await applyPlan() };
        }

        const effectivePlan = await applyPlan();

        // Extend from the later of now / current expiry (same rule as activateSubscription).
        const now = new Date();
        const currentExpiry = tenant.subscription_expires_at
          ? new Date(tenant.subscription_expires_at)
          : now;
        const base = currentExpiry > now ? currentExpiry : now;
        const newExpiry = new Date(base);
        newExpiry.setMonth(newExpiry.getMonth() + months);
        const startedAt = tenant.subscription_started_at || now;

        await client.query(
          `UPDATE tenants
             SET subscription_status = 'active',
                 subscription_started_at = $2,
                 subscription_expires_at = $3,
                 updated_at = NOW()
           WHERE id = $1`,
          [tenant.id, startedAt, newExpiry]
        );
        await client.query(
          `UPDATE payments SET processed_at = NOW(), subscription_extended_to = $2 WHERE trx_id = $1`,
          [orderId, newExpiry]
        );
        return { status: 200, tenantId: tenant.id, expiresAt: newExpiry, plan: effectivePlan };
      }
    );

    if (result.status === 403) {
      // The paying account does not own this tenant: terminal for the caller. Distinguished from the
      // secret-misconfig 403 (returned at the top, before any processing) by this error body, which
      // the caller matches to treat ownership denial as terminal.
      auditInternal(c, result.tenantId, 'tenant.activation_denied', {
        username,
        payer,
        orderId,
        reason: 'payer_not_owner',
      });
      return c.json({ error: 'payer_not_owner' }, 403);
    }
    if (result.status === 404) {
      auditInternal(c, null, 'tenant.activation_denied', {
        username,
        payer,
        orderId,
        reason: 'tenant_not_found',
      });
      return c.json({ error: 'tenant_not_found' }, 404);
    }
    if (result.status === 409) {
      // The order id is already recorded against a DIFFERENT tenant -- a collision/misroute.
      // Surface it (the caller treats non-200/404 as retryable + alerts) rather than mutate.
      auditInternal(c, result.tenantId, 'tenant.activation_denied', {
        username,
        payer,
        orderId,
        reason: 'order_tenant_mismatch',
      });
      return c.json({ error: 'order_tenant_mismatch' }, 409);
    }

    // Do not acknowledge a new fulfillment until the paid tenant is actually being served. An
    // active duplicate also retries config publication (the first response may have failed here),
    // while an expired/suspended duplicate is already-processed history and remains idempotently
    // acknowledgeable without reactivating or extending it.
    let tenant: Tenant | null = null;
    let publishError: Error | null = null;
    // Tri-state, not a boolean: an expired/suspended replay deliberately does not attempt
    // publication, and "not attempted" must not be recorded as "published".
    let publication: 'published' | 'skipped' | 'failed' = 'failed';
    try {
      tenant = await TenantService.getByUsername(username);
      if (!tenant) {
        throw new Error(`Activated tenant ${username} is not available for config generation`);
      }
      if (tenant.subscriptionStatus === 'active') {
        await ConfigService.generateConfigFile(tenant);
        publication = 'published';
      } else if (!result.duplicate) {
        throw new Error(`Activated tenant ${username} is not active for config generation`);
      } else {
        publication = 'skipped';
      }
    } catch (e) {
      publishError = e as Error;
      publication = 'failed';
    }

    // The activation transaction is COMMITTED by this point -- the tenant is active and the order
    // is recorded -- so the event is written whatever publication did, carrying the outcome rather
    // than being skipped. Skipping it would leave an active, paid tenant with no event at all once
    // the caller stops retrying, and a later successful retry would log `duplicate: true` at the
    // retry's timestamp, describing the retry instead of the mutation that actually happened.
    auditInternal(c, result.tenantId ?? tenant?.id, 'tenant.activated', {
      username,
      payer,
      orderId,
      months,
      amountUsd,
      plan: result.plan,
      requestedPlan: plan,
      duplicate: !!result.duplicate,
      // An expired/suspended duplicate is acknowledged without being reactivated, so the event
      // carries the tenant's real status: 'active' means a blog is being served, anything else
      // means this was a replay acknowledgment that changed nothing. Null when the reload itself
      // failed, which is what `publication: 'failed'` then explains.
      tenantStatus: tenant?.subscriptionStatus ?? null,
      publication,
      ...(publishError ? { publishError: publishError.message } : {}),
      rail: 'card',
    });

    // Unchanged behaviour: publication failure is still a retryable 500 for the caller.
    if (publishError) {
      throw publishError;
    }

    // Echo the tenant's ACTUAL plan so the caller (ePoints) can confirm the Pro tier was honored.
    // Truthful on replays too (the upgrade is idempotent); an older service that ignores `plan`
    // omits this field, which the caller treats as a mismatch and retries.
    return c.json(
      { activated: true, duplicate: !!result.duplicate, expiresAt: result.expiresAt, plan: result.plan },
      200
    );
  } catch (e) {
    console.error('[internal/activate] error:', (e as Error).message);
    return c.json({ error: 'activation_failed' }, 500);
  }
});

// POST /v1/internal/domain - attach a custom domain to a tenant (service-to-service).
// The web proxy has already verified the caller owns `username` (HiveSigner token); the shared
// secret protects the endpoint. Mirrors the public /v1/domains shape but keyed by body username
// instead of a user JWT. Custom domains are a Pro-plan (custom-domain add-on) capability.
internalRoutes.post('/domain', async (c) => {
  if (!internalSecretOk(c.req.header('x-internal-secret'))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const username = String(body?.username || '').toLowerCase();
  const domain = String(body?.domain || '').toLowerCase().trim();

  if (!USERNAME_RE.test(username) || domain.length < 4 || domain.length > 255 || !DOMAIN_RE.test(domain)) {
    return c.json({ error: 'invalid_request' }, 400);
  }

  const tenant = await TenantService.getByUsername(username);
  if (!tenant) {
    return c.json({ error: 'tenant_not_found' }, 404);
  }
  // Custom domains require the Pro plan (internal value stays 'pro'; user-facing = Custom domain).
  if (tenant.subscriptionPlan !== 'pro') {
    return c.json({ error: 'custom_domain_requires_pro' }, 402);
  }

  // Refuse a domain another tenant already holds, verified or not: the column is
  // UNIQUE either way, so an unverified reservation still blocks everyone else.
  if (await TenantService.isDomainClaimed(domain, username)) {
    return c.json({ error: 'domain_in_use' }, 409);
  }

  let updated: Awaited<ReturnType<typeof TenantService.setCustomDomain>>;
  try {
    updated = await TenantService.setCustomDomain(username, domain);
  } catch (error) {
    if (error instanceof DomainInUseError) {
      return c.json({ error: 'domain_in_use' }, 409);
    }
    throw error;
  }
  // Recorded as soon as the tenant row changes, before the verification record it does not depend
  // on: setCustomDomain also clears custom_domain_verified, so if createVerification then threw,
  // the tenant's domain state would have changed with nothing in the trail to say what changed it.
  // Still verified means the statement matched the domain already stored, so
  // this was a repeat submit of a live domain and nothing was reset.
  if (updated.customDomainVerified) {
    return c.json({ domain, verified: true }, 200);
  }

  auditInternal(c, tenant.id, 'domain.added', { domain, username, via: 'internal' });

  await DomainService.createVerification(username, domain);
  const value = `${username}.${baseDomain}`;

  // The record NAME must be the domain itself: verification resolves the domain's CNAME
  // (and serving requires it too). The internal verification token is bookkeeping only;
  // surfacing it as the record name produced instructions that could never verify.
  return c.json({
    domain,
    verification: {
      type: 'CNAME',
      name: domain,
      value,
      instructions: `Add a CNAME record pointing ${domain} to ${value}`,
    },
  });
});

// POST /v1/internal/domain/verify - run the DNS check for a tenant's pending custom domain.
internalRoutes.post('/domain/verify', async (c) => {
  if (!internalSecretOk(c.req.header('x-internal-secret'))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const username = String(body?.username || '').toLowerCase();
  if (!USERNAME_RE.test(username)) {
    return c.json({ error: 'invalid_request' }, 400);
  }

  const tenant = await TenantService.getByUsername(username);
  if (!tenant) {
    return c.json({ error: 'tenant_not_found' }, 404);
  }
  if (!tenant.customDomain) {
    return c.json({ verified: false }, 200);
  }
  // Already verified earlier -> idempotent success.
  if (tenant.customDomainVerified) {
    return c.json({ verified: true }, 200);
  }

  // Captured before the DNS round trip so the result is applied to the domain
  // that was actually checked, not to whatever the row holds afterwards.
  const checkedDomain = tenant.customDomain;

  const ok = await DomainService.verifyDomain(checkedDomain, username);
  if (!ok) {
    return c.json({ verified: false }, 200);
  }

  // Null means the domain changed while DNS was being checked.
  if (!(await TenantService.verifyCustomDomain(username, checkedDomain))) {
    return c.json({ verified: false }, 200);
  }
  // Recorded here, not after the bookkeeping below: the tenant is already verified at this point,
  // and the idempotent early return above means a retry would never reach a later audit call. If
  // markVerified threw, the event would be lost permanently for a domain that IS verified.
  auditInternal(c, tenant.id, 'domain.verified', {
    domain: checkedDomain,
    username,
    via: 'internal',
  });

  await DomainService.markVerified(username, checkedDomain);
  addVerifiedDomainOrigin(checkedDomain);

  return c.json({ verified: true }, 200);
});

// POST /v1/internal/claim-blog - idempotently give an Ecency Pro member their free blog.
// The web proxy has already verified the caller is an active Pro member; the shared secret
// protects the endpoint. Creates a standard tenant if none exists and activates it free for a
// year. If the tenant already exists it is returned unchanged (no re-activation, no extension).
internalRoutes.post('/claim-blog', async (c) => {
  if (!internalSecretOk(c.req.header('x-internal-secret'))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const username = String(body?.username || '').toLowerCase();
  if (!USERNAME_RE.test(username)) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  const title = typeof body?.title === 'string' ? body.title.slice(0, 100) : undefined;
  const description = typeof body?.description === 'string' ? body.description.slice(0, 500) : undefined;

  try {
    // Build config outside the transaction (pure, no I/O).
    const config = await TenantService.buildConfig(username, { title, description });

    const result = await db.transaction<{ created: boolean; row: any }>(async (client) => {
      // Try to create; ON CONFLICT means the tenant already exists. DO UPDATE revives a row the
      // sweep marked 'abandoned' (an unpaid reservation) so a returning Pro member still gets their
      // free blog activated below; a LIVE tenant (WHERE unsatisfied) returns 0 rows and is handed
      // back unchanged (no re-activation, no extension). The revive is gated on the same
      // re-registration quarantine as the public create/subscribe paths, so a claim can't overwrite
      // a just-reclaimed row whose in-flight payment hasn't settled yet.
      //
      // owner is set to the claimant (= username; claim-blog is a personal Pro blog, owned by its
      // own account) on BOTH insert and revive. Setting it on revive avoids leaving a reclaimed
      // row's stale previous owner in place, and setting it on insert fixes the owner NOT NULL
      // column, which this INSERT previously omitted.
      const inserted = await client.query(
        `INSERT INTO tenants (username, owner, config, subscription_status, subscription_plan)
         VALUES ($1, $1, $2, 'inactive', 'standard')
         ON CONFLICT (username) DO UPDATE
           SET owner = EXCLUDED.owner,
               config = EXCLUDED.config,
               subscription_status = 'inactive',
               updated_at = NOW()
           WHERE tenants.subscription_status = 'abandoned'
             AND tenants.updated_at < NOW() - ($3 * INTERVAL '1 hour')
             AND ${CAUGHT_UP_SQL}
         RETURNING *`,
        [username, JSON.stringify(config), ABANDONED_REREGISTER_QUARANTINE_HOURS]
      );

      if (inserted.rowCount === 0) {
        const existing = await client.query(
          `SELECT * FROM tenants WHERE username = $1 FOR UPDATE`,
          [username]
        );
        const row = existing.rows[0];
        // A row that is still 'abandoned' means the DO UPDATE was blocked by the re-registration
        // quarantine, not by a live tenant. Returning it here would report success while skipping
        // activation, leaving the claimant a non-active blog. Reject as retryable so the claim is
        // retried after the quiet period instead. A live tenant (any other status) is a genuine
        // "already exists" and is returned unchanged.
        if (row?.subscription_status === 'abandoned') {
          throw Object.assign(new Error('reclaimed_recently'), { retryable: true });
        }
        return { created: false, row };
      }

      const tenantId = inserted.rows[0].id;
      // Record the free grant for the audit/payment trail (idempotent on the synthetic trx_id).
      await client.query(
        `INSERT INTO payments
           (id, tenant_id, trx_id, block_num, from_account, amount, currency, memo, status, months_credited, processed_at)
         VALUES (gen_random_uuid(), $1, $2, 0, 'ecency-pro', 0, 'USD', $3, 'processed', 12, NOW())
         ON CONFLICT (trx_id) DO NOTHING`,
        [tenantId, `free-claim:${username}`, `pro:claim-blog:${username}`]
      );

      const activated = await client.query(
        `UPDATE tenants
           SET subscription_status = 'active',
               subscription_started_at = NOW(),
               subscription_expires_at = NOW() + INTERVAL '12 months',
               updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [tenantId]
      );
      return { created: true, row: activated.rows[0] };
    });

    const tenant = mapTenantFromDb(result.row);

    // Generate the config file for a freshly-created tenant (non-critical, outside the tx).
    if (result.created) {
      try {
        await ConfigService.generateConfigFile(tenant);
      } catch (err) {
        console.error(`[internal/claim-blog] config generation failed for ${username}:`, err);
      }
    }

    // A claim that found a live tenant is logged too: it is still a Pro member exercising the perk,
    // and `created: false` is what distinguishes it from the grant that actually provisioned a blog.
    auditInternal(c, tenant.id, 'tenant.pro_blog_claimed', {
      username,
      created: result.created,
      plan: tenant.subscriptionPlan,
      subscriptionStatus: tenant.subscriptionStatus,
    });

    return c.json({
      tenant: {
        username: tenant.username,
        blogUrl: TenantService.getBlogUrl(tenant),
        subscriptionStatus: tenant.subscriptionStatus,
        subscriptionPlan: tenant.subscriptionPlan,
      },
    });
  } catch (e) {
    const err = e as Error & { retryable?: boolean };
    console.error('[internal/claim-blog] error:', err.message);
    // 503 (transient) so the caller retries the claim after the re-registration quiet period,
    // rather than a permanent failure or a false success.
    if (err.retryable) return c.json({ error: 'reclaimed_recently' }, 503);
    return c.json({ error: 'claim_failed' }, 500);
  }
});

export default internalRoutes;

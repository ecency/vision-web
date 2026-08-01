/**
 * Tenant Management Routes
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { db } from '../db/client';
import {
  TenantService,
  isReregisterableAbandoned,
  ABANDONED_REREGISTER_QUARANTINE_HOURS,
} from '../services/tenant-service';
import { mapTenantFromDb } from '../types';
import { PAYMENT_ACCOUNT, MONTHLY_PRICE_HBD, PRO_UPGRADE_PRICE_HBD, hbd } from '../pricing';
import { ConfigService, isPublishableTenant } from '../services/config-service';
import { authMiddleware } from '../middleware/auth';
import { subscriptionPaywall, proUpgradePaywall } from '../middleware/x402-paywall';
import { withPaymentTargetLock } from '../middleware/payment-target-lock';
import { AuditService, parseClientIp } from '../services/audit-service';

export const tenantRoutes = new Hono();

// Validation schemas
const createTenantSchema = z.object({
  username: z.string().min(3).max(16).regex(/^[a-z][a-z0-9.-]*$/),
  owner: z.string().min(3).max(16).regex(/^[a-z][a-z0-9.-]*$/).optional(),
  config: z.object({
    theme: z.enum(['light', 'dark', 'system']).optional(),
    styleTemplate: z.enum(['medium', 'minimal', 'magazine', 'developer', 'modern-gradient']).optional(),
    type: z.enum(['blog', 'community']).optional(),
    communityId: z.string().optional(),
    title: z.string().max(100).optional(),
    description: z.string().max(500).optional(),
  }).optional(),
});

// PATCH accepts either the FULL config document (what the instance's Configuration Editor
// holds: { version, configuration: {...} }) or the legacy flat keys. The union is ordered
// full-document first: a flat body has no `configuration` key so it falls through, while a
// full document must never be matched by the flat schema (which would strip everything).
const fullConfigDocSchema = z.object({
  version: z.number().int().optional(),
  configuration: z.record(z.any()),
});
const flatConfigUpdateSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  styleTemplate: z.enum(['medium', 'minimal', 'magazine', 'developer', 'modern-gradient']).optional(),
  title: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  listType: z.enum(['list', 'grid']).optional(),
  sidebarPlacement: z.enum(['left', 'right']).optional(),
});
const updateTenantSchema = z.object({
  config: z.union([fullConfigDocSchema, flatConfigUpdateSchema]).optional(),
});

// Upper bound for a config document; far above any real config, guards the DB row.
const MAX_CONFIG_BYTES = 64 * 1024;

// GET /v1/tenants?owner=name - List the tenants an account controls (public info only,
// the same fields GET /:username already exposes). Lets the hosting page show a "manage"
// view for an owner's blog and communities.
tenantRoutes.get('/', async (c) => {
  const owner = (c.req.query('owner') || '').toLowerCase().trim();
  if (!/^[a-z][a-z0-9.-]{2,15}$/.test(owner)) {
    return c.json({ error: 'owner query parameter is required' }, 400);
  }

  const tenants = await TenantService.getByOwner(owner);
  return c.json({
    tenants: tenants.map((tenant) => ({
      username: tenant.username,
      owner: tenant.owner,
      type: tenant.config?.configuration?.instanceConfiguration?.type || 'blog',
      subscriptionStatus: tenant.subscriptionStatus,
      subscriptionPlan: tenant.subscriptionPlan,
      subscriptionExpiresAt: tenant.subscriptionExpiresAt,
      customDomain: tenant.customDomain,
      customDomainVerified: tenant.customDomainVerified,
      blogUrl: TenantService.getBlogUrl(tenant),
    })),
  });
});

// GET /v1/tenants/:username - Get tenant info
tenantRoutes.get('/:username', async (c) => {
  const username = c.req.param('username');
  
  const tenant = await TenantService.getByUsername(username);
  
  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404);
  }
  
  return c.json({
    username: tenant.username,
    owner: tenant.owner,
    subscriptionStatus: tenant.subscriptionStatus,
    subscriptionPlan: tenant.subscriptionPlan,
    subscriptionExpiresAt: tenant.subscriptionExpiresAt,
    customDomain: tenant.customDomain,
    customDomainVerified: tenant.customDomainVerified,
    blogUrl: TenantService.getBlogUrl(tenant),
    createdAt: tenant.createdAt,
  });
});

// GET /v1/tenants/:username/config - Get tenant config (for blog app)
tenantRoutes.get('/:username/config', async (c) => {
  const username = c.req.param('username');
  
  const tenant = await TenantService.getByUsername(username);
  
  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404);
  }
  
  // Check subscription is active
  if (tenant.subscriptionStatus !== 'active') {
    return c.json({ error: 'Subscription inactive' }, 402);
  }
  
  return c.json(tenant.config);
});

// POST /v1/tenants - Create new tenant (requires payment)
// Validate a tenant-create request (shared by POST / and /subscribe). Enforces that the showcased
// and owner accounts exist; that a PERSONAL blog is controlled by its own account (owner === the
// username) so a direct API call cannot assign someone else as controller of a blog; and that a
// COMMUNITY has a real, separate owner account plus a valid, existing community id equal to the
// subdomain. Returns the resolved owner or a client error.
/** Hive names a community account hive-NNNN; the subdomain must match it. */
const COMMUNITY_NAME = /^hive-\d+$/;

export async function resolveAndValidateTenant(
  body: any
): Promise<{ ok: true; owner: string } | { ok: false; status: 400; error: string }> {
  const username = body.username.toLowerCase();
  const owner = (body.owner || body.username).toLowerCase();
  // Derived from the subdomain being claimed, never from the caller-supplied
  // type. Trusting body.config.type let a caller omit it, take the personal
  // blog branch (which only requires owner === username) and capture a
  // community's subdomain with no ownership check at all. A community account
  // is a real Hive account, so the account existence check does not stop it.
  const isCommunity =
    COMMUNITY_NAME.test(username) || body.config?.type === 'community';

  if (!(await TenantService.verifyHiveAccount(username))) {
    return { ok: false, status: 400, error: 'Hive account not found' };
  }
  if (!(await TenantService.verifyHiveAccount(owner))) {
    return { ok: false, status: 400, error: 'Owner account not found' };
  }

  if (isCommunity) {
    const communityId = (body.config?.communityId || username).toLowerCase();
    if (!COMMUNITY_NAME.test(communityId)) {
      return { ok: false, status: 400, error: 'Community id must look like hive-NNNN' };
    }
    if (username !== communityId) {
      return { ok: false, status: 400, error: 'Subdomain must equal the community id' };
    }
    // A community account holds no user's keys, so it can never be the controller: require an
    // explicit, different owner or the instance would be unmanageable.
    if (!body.owner || owner === communityId) {
      return { ok: false, status: 400, error: 'A community instance requires a separate owner account' };
    }
    if (!(await TenantService.verifyCommunityControlledBy(communityId, owner))) {
      return {
        ok: false,
        status: 400,
        error: 'Community not found, or the owner account does not administer it',
      };
    }
  } else if (owner !== username) {
    // A personal blog is always controlled by its own account; reject an attempt to assign a
    // different owner, which would let a direct API call hijack management of someone's blog.
    return { ok: false, status: 400, error: 'A personal blog must be owned by its own account' };
  }

  return { ok: true, owner };
}

tenantRoutes.post(
  '/',
  zValidator('json', createTenantSchema),
  // Use the same target reservation as paid /subscribe. Otherwise this unpaid create can insert
  // after the paid request's availability check but before its post-settlement tenant insert.
  (c, next) => withPaymentTargetLock(c, next, 'subscribe', c.req.valid('json').username),
  async (c) => {
    const body = c.req.valid('json');

    // Check if username already exists. An 'abandoned' row (an unpaid reservation the sweep
    // reclaimed) reads as available once it has cleared the re-registration quarantine — create()
    // revives it below. Within the quarantine — or while the payment listener isn't confirmed
    // caught up to head (so a pending on-chain payment for it may be unprocessed) — it is still
    // treated as taken so an in-flight payment for it isn't overwritten.
    const existing = await TenantService.getByUsername(body.username);
    if (existing && !(isReregisterableAbandoned(existing) && (await TenantService.isListenerCaughtUp()))) {
      return c.json({ error: 'Username already registered' }, 409);
    }

    // Validate accounts + community + ownership rules (shared with /subscribe).
    const validation = await resolveAndValidateTenant(body);
    if (!validation.ok) {
      return c.json({ error: validation.error }, validation.status);
    }
    const { owner } = validation;

    // Create tenant (inactive until payment). The served config file is NOT written here:
    // nginx serves any file that exists with no subscription check, so writing it now would
    // put an unpaid blog live forever. The file is generated only on activation (payment
    // listener / internal activate / subscribe). create() upserts, so it also revives an
    // 'abandoned' row and throws isConflict only if a LIVE tenant now holds the name (a race
    // the target lock makes near-impossible, but handled for safety).
    let tenant;
    try {
      tenant = await TenantService.create(body.username, owner, body.config);
    } catch (err: any) {
      if (err?.isConflict) {
        return c.json({ error: 'Username already registered' }, 409);
      }
      throw err;
    }

    const baseDomain = process.env.BASE_DOMAIN || 'blogs.ecency.com';
    const paymentAccount = PAYMENT_ACCOUNT;
    const monthlyPrice = hbd(MONTHLY_PRICE_HBD);

    void AuditService.log({
      tenantId: tenant.id,
      eventType: 'tenant.created',
      eventData: { username: body.username, owner },
      ipAddress: parseClientIp(c.req.header('x-forwarded-for')),
      userAgent: c.req.header('user-agent'),
    });

    return c.json({
      tenant: {
        username: tenant.username,
        subscriptionStatus: tenant.subscriptionStatus,
        blogUrl: `https://${tenant.username}.${baseDomain}`,
      },
      paymentInstructions: {
        to: paymentAccount,
        amount: `${monthlyPrice} HBD`,
        memo: `blog:${tenant.username}`,
        note: 'Send this exact memo to activate your blog',
      },
    }, 201);
  }
);

// POST /v1/tenants/subscribe - Create tenant via x402 payment
// Validation runs before paywall so we don't settle payment for invalid requests
tenantRoutes.post('/subscribe',
  zValidator('json', createTenantSchema),
  // Hold the target reservation across validation, facilitator settlement, and the DB mutation.
  // A competing paid request is rejected here, before its signed transfer can be broadcast.
  (c, next) => withPaymentTargetLock(c, next, 'subscribe', c.req.valid('json').username),
  async (c, next) => {
    const body = c.req.valid('json');
    // An 'abandoned' row past the re-registration quarantine reads as available; the DB
    // transaction below revives it on settlement. Checked BEFORE the paywall so a payment is never
    // settled for a name that is still quarantined, or whose listener isn't confirmed caught up
    // (either of which would fail the upsert's guard and strand the settlement).
    const existing = await TenantService.getByUsername(body.username);
    if (existing && !(isReregisterableAbandoned(existing) && (await TenantService.isListenerCaughtUp()))) {
      return c.json({ error: 'Username already registered' }, 409);
    }
    // Same account + community + ownership validation as POST /, BEFORE the paywall so a payment is
    // never settled for a request the create route would reject (unverified owner, invalid community).
    const validation = await resolveAndValidateTenant(body);
    if (!validation.ok) {
      return c.json({ error: validation.error }, validation.status);
    }
    // Build the tenant config on the UNPAID side of the paywall: it may fetch a community
    // title over RPC, and once payment settles nothing but the DB transaction may stand
    // between settlement and the recorded claim (a crash inside a network wait would leave
    // a settled payment with no tenant/payment row).
    c.set('tenantConfig', await TenantService.buildConfig(body.username, body.config, validation.owner));
    await next();
  },
  subscriptionPaywall,
  async (c) => {
    const body = c.req.valid('json');
    const payer = c.get('payer');
    const txId = c.get('txId');

    if (!payer || typeof payer !== 'string' || !txId || typeof txId !== 'string') {
      return c.json({ error: 'Missing or invalid payer/txId from payment settlement' }, 502);
    }

    // Resolve owner (defaults to the showcased account for a self-serve personal blog).
    const owner = (body.owner || body.username).toLowerCase();

    // Prebuilt on the unpaid side of the paywall (see the validation middleware above); no
    // network I/O should run between payment settlement and the DB transaction. The inline
    // rebuild is a defensive fallback only: payment HAS settled here, so recording it late
    // beats refusing to record it at all.
    const tenantConfig =
      c.get('tenantConfig') ?? (await TenantService.buildConfig(body.username, body.config, owner));
    // The x402 paywall settles the payment (money has moved) and provides payer + txId, but
    // not a block number. Payment MUST still be recorded and the blog activated; refusing on
    // a missing block would take money and grant nothing. block_num 0 is informational only
    // (dedup is on trx_id), matching the card/internal-activate path.
    const blockNumRaw = c.get('blockNum');
    const blockNum = Number.isInteger(blockNumRaw) && blockNumRaw > 0 ? blockNumRaw : 0;

    // All mutations inside a DB transaction to prevent orphan tenants
    const result = await db.transaction(async (client) => {
      // Create tenant — the upsert handles a concurrent-create race and revives a row the sweep
      // marked 'abandoned' AND past the re-registration quarantine. Unlike the create/claim-blog
      // upserts, this one deliberately does NOT re-check the listener caught-up watermark: this
      // runs AFTER the paywall has settled the payment, and the pre-paywall availability check
      // already verified the watermark (a fresh watermark there means the name had no pending
      // on-chain payment at settle time). Re-checking a watermark that can flip stale during
      // settlement would turn a listener blip into a paid-but-unrecorded order. The quarantine
      // guard, which only moves forward, is stable across the settlement and is kept.
      const tenantRow = await client.query(
        `INSERT INTO tenants (username, owner, config, subscription_status, subscription_plan)
         VALUES ($1, $2, $3, 'inactive', 'standard')
         ON CONFLICT (username) DO UPDATE
           SET owner = EXCLUDED.owner,
               config = EXCLUDED.config,
               subscription_plan = 'standard',
               subscription_status = 'inactive',
               created_at = NOW(),
               updated_at = NOW()
           WHERE tenants.subscription_status = 'abandoned'
             AND tenants.updated_at < NOW() - ($4 * INTERVAL '1 hour')
         RETURNING *`,
        [body.username.toLowerCase(), owner, JSON.stringify(tenantConfig), ABANDONED_REREGISTER_QUARANTINE_HOURS]
      );
      if (tenantRow.rowCount === 0) {
        throw Object.assign(new Error('Username already registered'), { isConflict: true });
      }
      const tenantId = tenantRow.rows[0].id;

      // Claim payment — if already claimed, rollback (duplicate)
      const paymentResult = await client.query(
        `INSERT INTO payments (id, tenant_id, trx_id, block_num, from_account, amount, currency, memo, status, months_credited, processed_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'HBD', $6, 'processed', 1, NOW())
         ON CONFLICT (trx_id) DO NOTHING`,
        [
          tenantId,
          txId,
          blockNum,
          payer,
          MONTHLY_PRICE_HBD,
          `x402:subscribe:${body.username}`,
        ]
      );

      if (paymentResult.rowCount === 0) {
        throw Object.assign(new Error('Payment already processed'), { isDuplicate: true });
      }

      // Activate subscription (use SQL INTERVAL for correct month arithmetic)
      const activatedRow = await client.query(
        `UPDATE tenants
         SET subscription_status = 'active',
             subscription_started_at = NOW(),
             subscription_expires_at = NOW() + INTERVAL '1 month',
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [tenantId]
      );

      return activatedRow.rows[0];
    }).catch((err) => {
      if (err.isDuplicate) return null;
      if (err.isConflict) return 'conflict';
      throw err;
    });

    if (result === 'conflict') {
      return c.json({ error: 'Username already registered' }, 409);
    }

    if (!result) {
      return c.json({ error: 'Payment already processed' }, 409);
    }

    // Generate config outside the transaction (non-critical)
    const activatedTenant = mapTenantFromDb(result);
    try {
      await ConfigService.generateConfigFile(activatedTenant);
    } catch (err) {
      console.error(`Failed to generate config for ${body.username}:`, err);
    }

    void AuditService.log({
      tenantId: activatedTenant.id,
      eventType: 'tenant.subscribed',
      eventData: { username: body.username, payer, txId },
      ipAddress: parseClientIp(c.req.header('x-forwarded-for')),
      userAgent: c.req.header('user-agent'),
    });

    return c.json({
      tenant: {
        username: activatedTenant.username,
        subscriptionStatus: activatedTenant.subscriptionStatus,
        subscriptionExpiresAt: activatedTenant.subscriptionExpiresAt,
        blogUrl: TenantService.getBlogUrl(activatedTenant),
      },
      payment: { payer, txId },
    }, 201);
  }
);

// POST /v1/tenants/:username/upgrade - Upgrade to Pro via x402 payment
// Validation runs before paywall so we don't settle payment for invalid requests
tenantRoutes.post('/:username/upgrade',
  authMiddleware,
  // See /subscribe: serialize eligibility + settlement + mutation for this tenant so two
  // concurrent upgrade requests cannot both pay before one observes the other's Pro update.
  (c, next) => withPaymentTargetLock(c, next, 'upgrade', c.req.param('username')!),
  async (c, next) => {
    const username = c.req.param('username')!;
    const authUser = c.get('user');
    const tenant = await TenantService.getByUsername(username);
    if (!tenant) {
      return c.json({ error: 'Tenant not found' }, 404);
    }
    // Only the controlling owner may pin a Pro plan onto the tenant, not any wallet that can pay.
    if (authUser.username !== tenant.owner) {
      return c.json({ error: 'Unauthorized' }, 403);
    }
    if (tenant.subscriptionStatus !== 'active') {
      return c.json({ error: 'Subscription must be active to upgrade' }, 400);
    }
    if (tenant.subscriptionPlan === 'pro') {
      return c.json({ error: 'Already on Pro plan' }, 409);
    }
    await next();
  },
  proUpgradePaywall,
  async (c) => {
    const username = c.req.param('username')!;
    const payer = c.get('payer');
    const txId = c.get('txId');

    if (!payer || typeof payer !== 'string' || !txId || typeof txId !== 'string') {
      return c.json({ error: 'Missing or invalid payer/txId from payment settlement' }, 502);
    }

    // See /subscribe: x402 settlement provides no block number; record with 0 rather than
    // 502-ing after the money has already moved.
    const blockNumRaw = c.get('blockNum');
    const blockNum = Number.isInteger(blockNumRaw) && blockNumRaw > 0 ? blockNumRaw : 0;

    // Payment claim + upgrade inside a DB transaction with row lock
    const result = await db.transaction(async (client) => {
      // Re-check eligibility with row lock to prevent concurrent upgrades
      const tenantRow = await client.query(
        `SELECT id, subscription_status, subscription_plan FROM tenants WHERE username = $1 FOR UPDATE`,
        [username.toLowerCase()]
      );
      if (tenantRow.rowCount === 0) {
        throw Object.assign(new Error('Tenant not found'), { isNotFound: true });
      }
      const tenant = tenantRow.rows[0];
      if (tenant.subscription_status !== 'active') {
        throw Object.assign(new Error('Subscription must be active to upgrade'), { isInactive: true });
      }
      if (tenant.subscription_plan === 'pro') {
        throw Object.assign(new Error('Already on Pro plan'), { isAlreadyPro: true });
      }

      const paymentResult = await client.query(
        `INSERT INTO payments (id, tenant_id, trx_id, block_num, from_account, amount, currency, memo, status, months_credited, processed_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'HBD', $6, 'processed', 0, NOW())
         ON CONFLICT (trx_id) DO NOTHING`,
        [
          tenant.id,
          txId,
          blockNum,
          payer,
          PRO_UPGRADE_PRICE_HBD,
          `x402:upgrade:${username}`,
        ]
      );

      if (paymentResult.rowCount === 0) {
        throw Object.assign(new Error('Payment already processed'), { isDuplicate: true });
      }

      const upgradedRow = await client.query(
        `UPDATE tenants
         SET subscription_plan = 'pro', updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [tenant.id]
      );

      return upgradedRow.rows[0];
    }).catch((err) => {
      if (err.isDuplicate) return 'duplicate';
      if (err.isNotFound) return 'not_found';
      if (err.isInactive) return 'inactive';
      if (err.isAlreadyPro) return 'already_pro';
      throw err;
    });

    if (result === 'not_found') {
      return c.json({ error: 'Tenant not found' }, 404);
    }
    if (result === 'inactive') {
      return c.json({ error: 'Subscription must be active to upgrade' }, 400);
    }
    if (result === 'already_pro') {
      return c.json({ error: 'Already on Pro plan' }, 409);
    }
    if (result === 'duplicate') {
      return c.json({ error: 'Payment already processed' }, 409);
    }

    if (!result) {
      return c.json({ error: 'Payment already processed' }, 409);
    }

    const upgradedTenant = mapTenantFromDb(result);

    void AuditService.log({
      tenantId: upgradedTenant.id,
      eventType: 'tenant.upgraded',
      eventData: { username, plan: 'pro', payer, txId },
      ipAddress: parseClientIp(c.req.header('x-forwarded-for')),
      userAgent: c.req.header('user-agent'),
    });

    return c.json({
      tenant: {
        username: upgradedTenant.username,
        subscriptionPlan: upgradedTenant.subscriptionPlan,
        blogUrl: TenantService.getBlogUrl(upgradedTenant),
      },
      payment: { payer, txId },
    });
  }
);

// PATCH /v1/tenants/:username - Update tenant config (requires auth)
tenantRoutes.patch('/:username', authMiddleware, zValidator('json', updateTenantSchema), async (c) => {
  const username = c.req.param('username');
  const body = c.req.valid('json');
  const authUser = c.get('user');

  const tenant = await TenantService.getByUsername(username);
  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404);
  }

  // Authorize the controlling owner, not the showcased account (a community's keys are held
  // by no one). For a personal blog owner === username, so this stays equivalent.
  if (authUser.username !== tenant.owner) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  if (
    body.config &&
    Buffer.byteLength(JSON.stringify(body.config), 'utf8') > MAX_CONFIG_BYTES
  ) {
    return c.json({ error: 'Configuration document too large' }, 413);
  }

  // Full document (Configuration Editor) deep-merges into the stored config with identity
  // fields pinned server-side; flat keys are normalized first, then merge the same way.
  const isFullDoc =
    !!body.config && typeof body.config === 'object' && 'configuration' in body.config;
  const updatedTenant = isFullDoc
    ? await TenantService.applyConfigDocument(username, body.config)
    : await TenantService.updateConfig(username, body.config);
  
  // Publish only for a tenant that is entitled to be served. POST deliberately
  // does not write the file for the same reason: nginx serves any file that
  // exists with no subscription check, so publishing here would put a blog that
  // has never been paid for live until the next sweep removes it. The config
  // itself is always persisted, so the edit is not lost.
  const published = isPublishableTenant(updatedTenant);
  if (published) {
    await ConfigService.generateConfigFile(updatedTenant);
  }
  
  void AuditService.log({
    tenantId: updatedTenant.id,
    eventType: 'tenant.config_updated',
    eventData: { username },
    ipAddress: parseClientIp(c.req.header('x-forwarded-for')),
    userAgent: c.req.header('user-agent'),
  });

  return c.json({
    username: updatedTenant.username,
    config: updatedTenant.config,
    // Tells the editor whether the change is live or only stored, so a saved
    // edit that the visitor cannot see yet is explainable.
    published,
    message: published
      ? 'Configuration updated'
      : 'Configuration saved. It goes live once the subscription is active.',
  });
});

// GET /v1/tenants/:username/status - Quick status check
tenantRoutes.get('/:username/status', async (c) => {
  const username = c.req.param('username');
  
  const tenant = await TenantService.getByUsername(username);
  
  if (!tenant) {
    return c.json({ 
      exists: false,
      subscriptionStatus: 'none',
    });
  }
  
  const now = new Date();
  const expiresAt = tenant.subscriptionExpiresAt ? new Date(tenant.subscriptionExpiresAt) : null;
  const daysRemaining = expiresAt ? Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

  return c.json({
    exists: true,
    subscriptionStatus: tenant.subscriptionStatus,
    subscriptionPlan: tenant.subscriptionPlan,
    daysRemaining,
    customDomain: tenant.customDomain,
    customDomainVerified: tenant.customDomainVerified,
    blogUrl: TenantService.getBlogUrl(tenant),
  });
});

// DELETE /v1/tenants/:username - Delete tenant (requires auth)
tenantRoutes.delete('/:username', authMiddleware, async (c) => {
  const username = c.req.param('username')!;
  const authUser = c.get('user');

  // Capture tenant before deletion (for the owner check and the audit trail)
  const tenant = await TenantService.getByUsername(username);
  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404);
  }

  // Authorize the controlling owner, not the showcased account.
  if (authUser.username !== tenant.owner) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  await TenantService.delete(username);
  await ConfigService.deleteConfigFile(username);

  void AuditService.log({
    tenantId: tenant.id,
    eventType: 'tenant.deleted',
    eventData: { username },
    ipAddress: parseClientIp(c.req.header('x-forwarded-for')),
    userAgent: c.req.header('user-agent'),
  });

  return c.json({ message: 'Tenant deleted' });
});

export default tenantRoutes;

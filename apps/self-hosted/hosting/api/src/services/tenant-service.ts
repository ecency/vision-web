/**
 * Tenant Service
 */

import { db } from '../db/client';
import { callRPC, config as hiveTxConfig } from '@ecency/sdk/hive';
import { Tenant, TenantRow, mapTenantFromDb } from '../types';

// Re-export Tenant type for backward compatibility
export type { Tenant } from '../types';

// Configure hive-tx nodes
hiveTxConfig.nodes = process.env.HIVE_API_URL?.split(',') || ['https://api.hive.blog'];
const baseDomain = process.env.BASE_DOMAIN || 'blogs.ecency.com';

// Roles that may claim a community's hosted instance. Mods moderate content but
// do not control the community's identity, so they are deliberately excluded.
/**
 * Hive names a community account hive-NNNN. Shared so every path that can bring
 * a tenant into existence recognises a community claim the same way.
 */
export const COMMUNITY_NAME = /^hive-\d+$/;

const CONTROLLING_COMMUNITY_ROLES = new Set(['owner', 'admin']);

// Quiet period after the sweep marks a username 'abandoned' before it can be reserved again. It is
// a backstop; three enforced guarantees keep a paid-for reservation out of a re-registration:
//   1. create() refreshes the grace clock on every checkout re-entry, so an actively-paid
//      reservation is never a sweep target (covers card, whose ePoints activation may retry with
//      backoff far longer than an hour, and any web re-entry).
//   2. The sweep only reclaims while the listener is caught up (payment-listener isCaughtUp), so it
//      never marks a row abandoned during a replay backlog with unprocessed on-chain payments.
//   3. Re-registration itself is gated on a FRESH listener caught-up watermark (CAUGHT_UP_SQL), so
//      a listener that stalls AFTER a reclaim — leaving a just-arrived on-chain payment unprocessed
//      — blocks the name from being overwritten no matter how long the stall lasts.
// The time-based quarantine then only has to cover the residual seconds of healthy live tailing.
export const ABANDONED_REREGISTER_QUARANTINE_HOURS = 1;

// Whether an existing row is an abandoned reservation that has cleared the re-registration
// quarantine (so a fresh signup may reclaim its username). A live row, or one reclaimed within
// the quarantine, is NOT reusable. The SQL upsert applies the same guard atomically; this is the
// pre-check that also lets /subscribe reject before settling a payment.
export function isReregisterableAbandoned(t: Pick<Tenant, 'subscriptionStatus' | 'updatedAt'>): boolean {
  if (t.subscriptionStatus !== 'abandoned') return false;
  const cutoff = Date.now() - ABANDONED_REREGISTER_QUARANTINE_HOURS * 60 * 60 * 1000;
  return t.updatedAt.getTime() < cutoff;
}

// How fresh the payment-listener's caught-up watermark must be for re-registration of a reclaimed
// name to be allowed. The listener refreshes it every poll (~3s) while near head, so a value older
// than this means it is stalled or replaying a backlog and may not have processed a pending payment
// yet — in which case re-registration must be blocked regardless of the time-based quarantine. Used
// both as the SQL guard on the reclaim branch and by isListenerCaughtUp for the pre-paywall check.
export const LISTENER_CAUGHT_UP_MAX_AGE = "2 minutes";

// Reclaim-branch guard: true only if the payment listener has reported itself caught up to head
// recently. Fails safe to false (blocks re-registration) if the watermark is missing or stale.
// Exported so the /subscribe and claim-blog upserts apply the identical guard.
export const CAUGHT_UP_SQL = `EXISTS (
  SELECT 1 FROM system_config
  WHERE key = 'payment_listener.caught_up'
    AND updated_at > NOW() - INTERVAL '${LISTENER_CAUGHT_UP_MAX_AGE}'
)`;

export const TenantService = {
  /**
   * Get tenant by username
   */
  async getByUsername(username: string): Promise<Tenant | null> {
    const row = await db.queryOne<TenantRow>(
      'SELECT * FROM tenants WHERE username = $1',
      [username.toLowerCase()]
    );
    return row ? mapTenantFromDb(row) : null;
  },
  
  /**
   * Get tenant by custom domain
   */
  async getByDomain(domain: string): Promise<Tenant | null> {
    const row = await db.queryOne<TenantRow>(
      'SELECT * FROM tenants WHERE custom_domain = $1 AND custom_domain_verified = true',
      [domain.toLowerCase()]
    );
    return row ? mapTenantFromDb(row) : null;
  },

  /**
   * All tenants controlled by an owner account (their personal blog and any communities).
   */
  async getByOwner(owner: string): Promise<Tenant[]> {
    // Exclude 'abandoned' rows: a reclaimed, re-registerable reservation is effectively gone, so
    // it must not surface in the owner's manage listing (where an unmodeled status would render
    // as a misleading "expired" label).
    const rows = await db.queryAll<TenantRow>(
      `SELECT * FROM tenants WHERE owner = $1 AND subscription_status != 'abandoned' ORDER BY created_at`,
      [owner.toLowerCase()]
    );
    return rows.map(mapTenantFromDb);
  },
  
  /**
   * Create new tenant.
   *
   * `owner` is the Hive account that controls the instance and every mutating op is later
   * authorized against it. It defaults to `username` (a personal blog, where the showcased
   * account is also the owner). For a community the caller passes their own account as `owner`
   * while `username` is the community account (hive-NNNNN).
   */
  async create(username: string, owner?: string, configOverrides?: any): Promise<Tenant> {
    const ownerName = (owner || username).toLowerCase();

    // buildConfig normalizes flat API overrides (title, description, theme, styleTemplate, type,
    // communityId) into the nested shape the SPA actually reads. Merging the flat keys directly kept
    // them at the config root, where the SPA ignores them, so a signup's chosen title/theme/style
    // were silently dropped (and any community override too). Route both paths through buildConfig.
    const config = await this.buildConfig(username, configOverrides, ownerName);

    // Upsert with two conflict outcomes, distinguished by the existing row's status:
    //
    //  - 'abandoned' (past the re-registration quarantine): a fresh reservation RECLAIMS the name —
    //    overwrite owner + config. The quarantine (updated_at older than the window) protects a row
    //    whose earlier payment may still be in flight.
    //  - 'inactive' owned by the SAME owner: this is a re-entry into checkout for an existing
    //    reservation. REFRESH its grace clock (created_at = NOW) so the abandoned sweep can't
    //    reclaim it while it is actively being paid for — closing the window where an old reservation
    //    is swept mid-checkout and then overwritten before a slow payment (e.g. a card order ePoints
    //    retries with backoff for far longer than the quarantine) is finally recorded. Keep owner +
    //    config unchanged here (via CASE) so re-entry never overwrites an unpaid reservation's config.
    //
    // Any other row (live tenant, or a different owner's inactive reservation) leaves the WHERE
    // unsatisfied, returns no row, and is surfaced as a conflict. A brand-new username inserts.
    const row = await db.queryOne<TenantRow>(
      `INSERT INTO tenants (username, owner, config, subscription_status, subscription_plan)
       VALUES ($1, $2, $3, 'inactive', 'standard')
       ON CONFLICT (username) DO UPDATE
         SET owner = CASE WHEN tenants.subscription_status = 'abandoned'
                          THEN EXCLUDED.owner ELSE tenants.owner END,
             config = CASE WHEN tenants.subscription_status = 'abandoned'
                           THEN EXCLUDED.config ELSE tenants.config END,
             subscription_plan = 'standard',
             subscription_status = 'inactive',
             created_at = NOW(),
             updated_at = NOW()
         WHERE (tenants.subscription_status = 'abandoned'
                  AND tenants.updated_at < NOW() - ($4 * INTERVAL '1 hour')
                  AND ${CAUGHT_UP_SQL})
            OR (tenants.subscription_status = 'inactive' AND tenants.owner = EXCLUDED.owner)
       RETURNING *`,
      [username.toLowerCase(), ownerName, JSON.stringify(config), ABANDONED_REREGISTER_QUARANTINE_HOURS]
    );

    if (!row) {
      // Conflict with a live (non-abandoned) tenant — the username is genuinely taken.
      throw Object.assign(new Error('Username already registered'), { isConflict: true });
    }

    return mapTenantFromDb(row);
  },
  
  /**
   * Activate subscription
   */
  async activateSubscription(username: string, months: number): Promise<Tenant> {
    const tenant = await this.getByUsername(username);
    if (!tenant) throw new Error('Tenant not found');

    const now = new Date();
    const currentExpiry = tenant.subscriptionExpiresAt
      ? new Date(tenant.subscriptionExpiresAt)
      : now;

    // If expired, start from now; otherwise extend from current expiry
    const baseDate = currentExpiry > now ? currentExpiry : now;
    const newExpiry = new Date(baseDate);
    newExpiry.setMonth(newExpiry.getMonth() + months);

    const startedAt = tenant.subscriptionStartedAt || now;

    const row = await db.queryOne<TenantRow>(
      `UPDATE tenants
       SET subscription_status = 'active',
           subscription_started_at = $2,
           subscription_expires_at = $3,
           updated_at = NOW()
       WHERE username = $1
       RETURNING *`,
      [username.toLowerCase(), startedAt, newExpiry]
    );

    return mapTenantFromDb(row!);
  },

  /**
   * Update tenant config
   */
  async updateConfig(username: string, configUpdates: any): Promise<Tenant> {
    const tenant = await this.getByUsername(username);
    if (!tenant) throw new Error('Tenant not found');

    // Flat keys must be normalized into the nested stored shape first; merging them at the
    // config root leaves them where the SPA never reads them (same bug create() had).
    const newConfig = this.mergeConfig(
      tenant.config,
      this.normalizeFlatOverrides(configUpdates || {})
    );

    const row = await db.queryOne<TenantRow>(
      `UPDATE tenants
       SET config = $2,
           updated_at = NOW()
       WHERE username = $1
       RETURNING *`,
      [username.toLowerCase(), JSON.stringify(newConfig)]
    );

    return mapTenantFromDb(row!);
  },

  /**
   * Apply a config document edited in the instance's Configuration Editor. The sanitized
   * document is deep-merged into the stored config, so a partial document can only change the
   * sections it carries and can never erase the rest. Identity fields (username, owner, type,
   * communityId) are server-owned and pinned from the stored config so a config save can
   * never reassign control or re-type the tenant.
   */
  async applyConfigDocument(username: string, doc: any): Promise<Tenant> {
    const tenant = await this.getByUsername(username);
    if (!tenant) throw new Error('Tenant not found');

    const current = tenant.config?.configuration?.instanceConfiguration || {};
    // Identity comes from the tenant ROW (authorization's source of truth), never from the
    // stored config JSON, which could carry stale values from before the owner column.
    const clean = this.sanitizeConfigDocument(doc, {
      version: tenant.config?.version ?? 1,
      username: tenant.username,
      owner: tenant.owner,
      type: current.type ?? 'blog',
      communityId: current.communityId ?? '',
    });
    const newConfig = this.mergeConfigGuarded(tenant.config, clean);

    const row = await db.queryOne<TenantRow>(
      `UPDATE tenants
       SET config = $2,
           updated_at = NOW()
       WHERE username = $1
       RETURNING *`,
      [username.toLowerCase(), JSON.stringify(newConfig)]
    );

    return mapTenantFromDb(row!);
  },

  /**
   * Deep-merge a sanitized client document into the stored config, enforcing shape
   * agreement with the stored value at every depth: an object section can only be updated
   * by an object, an array only by an array, and a scalar only by another scalar. Keys the
   * stored config doesn't carry are accepted as-is (new settings). Stored configs always
   * originate from getDefaultConfig, so the stored document itself is the shape contract;
   * this keeps every known section's runtime shape intact no matter what an authenticated
   * client sends (e.g. `general: "oops"` or `postsFilters: "trending"`).
   */
  mergeConfigGuarded(base: any, updates: any): any {
    const result = Object.assign(Object.create(null), base);

    for (const key of Object.keys(updates)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        console.warn('[TenantService] Blocked prototype pollution attempt with key:', key);
        continue;
      }

      const incoming = updates[key];
      if (incoming === undefined) continue;

      const stored = result[key];
      const incomingIsPlainObject =
        incoming && typeof incoming === 'object' && !Array.isArray(incoming);
      const incomingIsArray = Array.isArray(incoming);

      if (stored === undefined || stored === null) {
        // No stored shape to agree with; take the incoming value.
        result[key] = incomingIsPlainObject
          ? this.mergeConfigGuarded(Object.create(null), incoming)
          : incoming;
      } else if (typeof stored === 'object' && !Array.isArray(stored)) {
        if (!incomingIsPlainObject) {
          console.warn('[TenantService] Dropped type-mismatched config value for key:', key);
          continue;
        }
        result[key] = this.mergeConfigGuarded(stored, incoming);
      } else if (Array.isArray(stored)) {
        if (!incomingIsArray || !this.isValidArrayReplacement(stored, incoming)) {
          console.warn('[TenantService] Dropped type-mismatched config value for key:', key);
          continue;
        }
        result[key] = incoming;
      } else {
        // Stored scalar: only a scalar of the SAME primitive type may replace it, so a
        // string "false" cannot stand in for a boolean, nor 42 for a string.
        if (incomingIsPlainObject || incomingIsArray || typeof incoming !== typeof stored) {
          console.warn('[TenantService] Dropped type-mismatched config value for key:', key);
          continue;
        }
        result[key] = incoming;
      }
    }

    return result;
  },

  /**
   * Config arrays hold primitives (post filters, auth methods). A replacement array must
   * contain only primitives, of the same type the stored array demonstrates when it has
   * elements. Pure.
   */
  isValidArrayReplacement(stored: any[], incoming: any[]): boolean {
    const elementType = stored.length > 0 ? typeof stored[0] : null;
    return incoming.every((item) => {
      if (item === null || typeof item === 'object') return false;
      return elementType ? typeof item === elementType : true;
    });
  },

  /**
   * Recursively drop null values from a client document. mergeConfig treats null as a
   * replacement value, so without this a document carrying `general: null` (or any nulled
   * nested key) would erase that whole stored section on merge. Null never means anything
   * in a config document; absence does. Pure.
   */
  stripNulls(value: any): any {
    if (Array.isArray(value)) {
      return value.filter((item) => item !== null && item !== undefined).map((item) => this.stripNulls(item));
    }
    if (value && typeof value === 'object') {
      const result: any = Object.create(null);
      for (const key of Object.keys(value)) {
        if (value[key] === null || value[key] === undefined) continue;
        result[key] = this.stripNulls(value[key]);
      }
      return result;
    }
    return value;
  },

  /**
   * Sanitize a client-supplied full config document: drop null values (a null section must
   * never erase stored settings), deep-copy through mergeConfig (strips prototype-pollution
   * vectors) and pin the server-owned identity fields. Pure.
   */
  sanitizeConfigDocument(
    doc: any,
    pins: { version: number; username: string; owner: string; type: string; communityId: string }
  ): any {
    const clean = this.mergeConfig(Object.create(null), this.stripNulls(doc || {}));
    clean.version = pins.version;
    // Arrays must be rejected, not just non-objects: an array passes typeof === 'object',
    // silently drops any pinned properties when serialized, and would replace the stored
    // object section wholesale on merge.
    if (
      !clean.configuration ||
      typeof clean.configuration !== 'object' ||
      Array.isArray(clean.configuration) ||
      Array.isArray(clean.configuration.instanceConfiguration)
    ) {
      throw new Error('Invalid configuration document');
    }
    const instance = (clean.configuration.instanceConfiguration =
      clean.configuration.instanceConfiguration &&
      typeof clean.configuration.instanceConfiguration === 'object'
        ? clean.configuration.instanceConfiguration
        : Object.create(null));

    instance.username = pins.username;
    instance.owner = pins.owner;
    instance.type = pins.type;
    instance.communityId = pins.communityId;
    // Served-only marker (injected at config-file generation); must never round-trip from a
    // client document into the stored config.
    delete instance.managed;

    return clean;
  },
  
  /**
   * Set custom domain
   */
  async setCustomDomain(username: string, domain: string): Promise<Tenant> {
    const row = await db.queryOne<TenantRow>(
      `UPDATE tenants
       SET custom_domain = $2,
           custom_domain_verified = false,
           custom_domain_verified_at = NULL,
           updated_at = NOW()
       WHERE username = $1
       RETURNING *`,
      [username.toLowerCase(), domain.toLowerCase()]
    );

    if (!row) throw new Error('Tenant not found');
    return mapTenantFromDb(row);
  },
  
  /**
   * Verify custom domain
   */
  async verifyCustomDomain(username: string): Promise<Tenant> {
    const row = await db.queryOne<TenantRow>(
      `UPDATE tenants
       SET custom_domain_verified = true,
           custom_domain_verified_at = NOW(),
           updated_at = NOW()
       WHERE username = $1
       RETURNING *`,
      [username.toLowerCase()]
    );

    if (!row) throw new Error('Tenant not found');
    return mapTenantFromDb(row);
  },

  /**
   * Remove custom domain and clean up verification records
   */
  async removeCustomDomain(username: string): Promise<void> {
    await db.transaction(async (client) => {
      // Get tenant first
      const tenant = await client.query<{ id: string }>(
        'SELECT id FROM tenants WHERE username = $1',
        [username.toLowerCase()]
      );

      if (tenant.rows.length === 0) {
        throw new Error('Tenant not found');
      }

      const tenantId = tenant.rows[0].id;

      // Remove custom domain from tenant
      await client.query(
        `UPDATE tenants
         SET custom_domain = NULL,
             custom_domain_verified = false,
             custom_domain_verified_at = NULL,
             updated_at = NOW()
         WHERE username = $1`,
        [username.toLowerCase()]
      );

      // Delete related domain verification records
      await client.query(
        'DELETE FROM domain_verifications WHERE tenant_id = $1',
        [tenantId]
      );
    });
  },
  
  /**
   * Delete tenant
   */
  async delete(username: string): Promise<void> {
    await db.query('DELETE FROM tenants WHERE username = $1', [username.toLowerCase()]);
  },
  
  /**
   * Expire subscriptions that have passed their expiry date
   */
  async expireSubscriptions(): Promise<number> {
    const result = await db.query(
      `UPDATE tenants
       SET subscription_status = 'expired'
       WHERE subscription_status = 'active'
         AND subscription_expires_at < NOW()`
    );
    return result.rowCount || 0;
  },

  /**
   * Reclaim abandoned signups: tenants that were created but NEVER paid (status 'inactive',
   * no payment rows) and have sat past the grace window. This frees their username, which an
   * inactive record would otherwise reserve forever.
   *
   * It SOFT-deletes — flips status to 'abandoned' rather than removing the row — precisely so a
   * payment that is still in flight when the sweep runs stays safe:
   *   - An HBD transfer sitting in a not-yet-replayed block has no payment row yet, so the
   *     `id NOT IN payments` guard cannot protect it; but because the row survives, replay's
   *     processSubscription finds it and activates it IN PLACE, keeping the original owner and
   *     config (a hard delete would recreate it with default config + owner = username, losing a
   *     personal blog's setup and making a community unmanageable).
   *   - A card order mid-settlement has no payment row either; the row surviving means
   *     /internal/activate still finds it and does not 404 the paid order.
   * A fresh reservation revives an 'abandoned' row (see create()), and every serve/list path
   * already keys on 'active', so an abandoned row neither serves nor blocks re-registration.
   * Because the operation is reversible, it needs no "listener caught up to head" gate — a
   * premature mark is harmless. Returns the reclaimed usernames for logging.
   *
   * The "has a payment" guard counts only real/in-flight payments (status not 'failed' or
   * 'refunded'): a rejected payment — e.g. an upgrade transfer refused because the tenant was
   * not active — logs a 'failed' row linked to the tenant, and if that counted here it would
   * permanently pin the (reusable) username against every future reclaim.
   */
  /**
   * Whether the payment listener has reported itself caught up to head recently. Mirrors the
   * CAUGHT_UP_SQL guard for use as a pre-check on paths that must decide BEFORE a payment settles
   * (e.g. /subscribe's pre-paywall availability check) whether a reclaimed name may be reused.
   * Fails safe to false if the watermark is missing or stale.
   */
  async isListenerCaughtUp(): Promise<boolean> {
    const row = await db.queryOne<{ fresh: boolean }>(
      `SELECT (updated_at > NOW() - INTERVAL '${LISTENER_CAUGHT_UP_MAX_AGE}') AS fresh
         FROM system_config WHERE key = 'payment_listener.caught_up'`
    );
    return row?.fresh === true;
  },

  async reclaimAbandonedTenants(graceDays: number): Promise<string[]> {
    const rows = await db.queryAll<{ username: string }>(
      `UPDATE tenants
         SET subscription_status = 'abandoned', updated_at = NOW()
         WHERE subscription_status = 'inactive'
           AND created_at < NOW() - ($1 * INTERVAL '1 day')
           AND id NOT IN (
             SELECT tenant_id FROM payments
             WHERE tenant_id IS NOT NULL AND status NOT IN ('failed', 'refunded')
           )
       RETURNING username`,
      [graceDays]
    );
    return rows.map((r) => r.username);
  },
  
  /**
   * Get all active tenants
   */
  async getActiveTenants(): Promise<Tenant[]> {
    const rows = await db.queryAll<TenantRow>(
      `SELECT * FROM tenants WHERE subscription_status = 'active' ORDER BY username`
    );
    return rows.map(mapTenantFromDb);
  },
  
  /**
   * Verify Hive account exists. Returns false on ANY failure, so callers that only need a
   * best-effort check (signup validation) get a simple boolean; an RPC outage looks the same
   * as a genuinely-absent account here. Payment processing must NOT use this — it needs to
   * tell those apart (see accountExistsStrict) so a real payment isn't permanently failed.
   */
  async verifyHiveAccount(username: string): Promise<boolean> {
    try {
      return await this.accountExistsStrict(username);
    } catch {
      return false;
    }
  },

  /**
   * Definitive account existence check: resolves true/false only for a real answer and
   * THROWS on an RPC/transport error. The payment listener relies on the throw to retry the
   * block rather than record a paid transfer as permanently failed during a node outage.
   */
  async accountExistsStrict(username: string): Promise<boolean> {
    const accounts = await callRPC('condenser_api.get_accounts', [[username]]);
    if (!Array.isArray(accounts)) {
      throw new Error('Unexpected get_accounts response');
    }
    return accounts.length > 0;
  },

  /**
   * Verify a Hive community exists (not merely an account named hive-NNNNN).
   */
  /**
   * A community instance may only be claimed by an account that controls the
   * community on chain. Verifying that the community merely exists would let
   * any account pay for, and permanently hold, the instance of a community it
   * has no part in: every later mutation authorises against tenants.owner, so
   * the real team could never take it back.
   *
   * `team` carries [account, role, title] tuples for the community's owner,
   * admins and mods. Only owner and admin are accepted, matching who can change
   * the community's own settings on chain.
   */
  async verifyCommunityControlledBy(communityId: string, account: string): Promise<boolean> {
    try {
      const community = await callRPC('bridge.get_community', { name: communityId, observer: '' }) as any;
      if (!community || community.name !== communityId) return false;

      const team = community.team;
      if (!Array.isArray(team)) return false;

      const claimant = account.toLowerCase();
      return team.some(
        (member: unknown) =>
          Array.isArray(member) &&
          typeof member[0] === 'string' &&
          member[0].toLowerCase() === claimant &&
          typeof member[1] === 'string' &&
          CONTROLLING_COMMUNITY_ROLES.has(member[1].toLowerCase())
      );
    } catch {
      // Fail closed: an RPC failure must not hand out a community instance.
      return false;
    }
  },
  
  /**
   * Get blog URL for tenant
   */
  getBlogUrl(tenant: Tenant): string {
    if (tenant.customDomain && tenant.customDomainVerified) {
      return `https://${tenant.customDomain}`;
    }
    return `https://${tenant.username}.${baseDomain}`;
  },
  
  /**
   * Build the full tenant config from defaults + overrides.
   * Normalizes flat API overrides into the nested stored config shape.
   * Pure function, safe to call outside a DB transaction.
   */
  async buildConfig(username: string, configOverrides?: any, owner?: string): Promise<any> {
    const defaults = await this.getDefaultConfig(username, owner);
    const merged = configOverrides
      ? this.mergeConfig(defaults, this.normalizeFlatOverrides(configOverrides))
      : defaults;

    // A community instance browses community feeds, not a personal blog's timeline; give it
    // community defaults wherever the signup didn't say otherwise.
    const instance = merged.configuration.instanceConfiguration;
    if (instance.type === 'community') {
      instance.features.postsFilters = ['trending', 'hot', 'created'];
      const communityId = instance.communityId || username;
      if (!configOverrides?.title) {
        const communityTitle = await this.getCommunityTitle(communityId);
        instance.meta.title = communityTitle || `${communityId} community`;
      }
      if (!configOverrides?.description) {
        instance.meta.description = 'A community powered by Hive blockchain';
      }
    }

    return merged;
  },

  /**
   * Map flat API keys (signup form / legacy PATCH body) to their nested stored-config paths.
   * Owner is server-resolved, not client-supplied, so it is never taken from overrides.
   */
  normalizeFlatOverrides(configOverrides: any): any {
    const normalized: any = {
      configuration: {
        general: {},
        instanceConfiguration: { meta: {}, layout: { sidebar: {} } },
      },
    };
    if (configOverrides.theme) normalized.configuration.general.theme = configOverrides.theme;
    if (configOverrides.styleTemplate) normalized.configuration.general.styleTemplate = configOverrides.styleTemplate;
    if (configOverrides.type) normalized.configuration.instanceConfiguration.type = configOverrides.type;
    if (configOverrides.communityId) normalized.configuration.instanceConfiguration.communityId = configOverrides.communityId;
    // undefined means "not provided"; an explicit empty string clears the field.
    if (configOverrides.title !== undefined) normalized.configuration.instanceConfiguration.meta.title = configOverrides.title;
    if (configOverrides.description !== undefined) normalized.configuration.instanceConfiguration.meta.description = configOverrides.description;
    if (configOverrides.listType) normalized.configuration.instanceConfiguration.layout.listType = configOverrides.listType;
    if (configOverrides.sidebarPlacement) normalized.configuration.instanceConfiguration.layout.sidebar.placement = configOverrides.sidebarPlacement;
    return normalized;
  },

  /**
   * Title of a Hive community, or null when the lookup fails (callers fall back to a
   * generated title; creation must not fail on a flaky RPC).
   */
  async getCommunityTitle(communityId: string): Promise<string | null> {
    try {
      // Bounded: this runs inside signup/payment flows, so a slow RPC must degrade to the
      // generated fallback title instead of holding the request.
      const community = await Promise.race([
        callRPC('bridge.get_community', { name: communityId, observer: '' }),
        new Promise((resolve) => setTimeout(() => resolve(null), 4000)),
      ]) as any;
      const title = community?.title;
      return typeof title === 'string' && title.trim().length > 0 ? title.trim().slice(0, 100) : null;
    } catch {
      return null;
    }
  },

  /**
   * Get default config for a new tenant.
   * `owner` is written into instanceConfiguration.owner, which the SPA reads for its ownership gate.
   */
  async getDefaultConfig(username: string, owner?: string): Promise<any> {
    return {
      version: 1,
      configuration: {
        general: {
          theme: 'system',
          styleTemplate: 'medium',
          language: 'en',
          timezone: 'UTC',
          dateFormat: 'YYYY-MM-DD',
          timeFormat: 'HH:mm:ss',
          dateTimeFormat: 'YYYY-MM-DD HH:mm:ss',
          imageProxy: 'https://i.ecency.com',
          profileBaseUrl: 'https://ecency.com/@',
          createPostUrl: 'https://ecency.com/publish',
          styles: {
            background: 'bg-gradient-to-br from-[#f8fafc] to-[#e2e8f0]',
          },
        },
        instanceConfiguration: {
          type: 'blog',
          username: username,
          owner: (owner || username).toLowerCase(),
          communityId: '',
          meta: {
            title: `${username}'s Blog`,
            description: 'A blog powered by Hive blockchain',
            logo: '',
            favicon: 'https://ecency.com/favicon.ico',
            keywords: 'hive, blog, blockchain',
          },
          layout: {
            listType: 'list',
            search: { enabled: true },
            sidebar: {
              placement: 'right',
              followers: { enabled: true },
              following: { enabled: true },
              hiveInformation: { enabled: true },
            },
          },
          features: {
            postsFilters: ['posts', 'blog'],
            likes: { enabled: true },
            comments: { enabled: true },
            post: { text2Speech: { enabled: true } },
            auth: {
              enabled: true,
              methods: ['keychain', 'hivesigner', 'hiveauth'],
            },
          },
        },
      },
    };
  },
  
  /**
   * Deep merge configs
   * Protected against prototype pollution attacks
   */
  mergeConfig(base: any, updates: any): any {
    // Create result with null prototype to prevent pollution
    const result = Object.assign(Object.create(null), base);

    // Only iterate own enumerable string keys
    for (const key of Object.keys(updates)) {
      // Skip prototype pollution vectors
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        console.warn('[TenantService] Blocked prototype pollution attempt with key:', key);
        continue;
      }

      const value = updates[key];

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Recursively merge objects, using empty plain object as default
        result[key] = this.mergeConfig(result[key] || Object.create(null), value);
      } else if (value !== undefined) {
        result[key] = value;
      }
    }

    return result;
  },
};

export default TenantService;

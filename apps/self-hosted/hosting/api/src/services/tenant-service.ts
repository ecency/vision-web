/**
 * Tenant Service
 */

import { db, type SqlExecutor } from '../db/client';
import { callRPC, config as hiveTxConfig } from '@ecency/sdk/hive';
import { Tenant, TenantRow, mapTenantFromDb } from '../types';
import { ApiError } from '../errors';

// Re-export Tenant type for backward compatibility
export type { Tenant } from '../types';

// Configure hive-tx nodes
hiveTxConfig.nodes = process.env.HIVE_API_URL?.split(',') || ['https://api.hive.blog'];
const UNIQUE_VIOLATION = '23505';

/** Raised when another tenant already holds the requested custom domain. */
export class DomainInUseError extends Error {
  constructor(public readonly domain: string) {
    super('Domain already in use');
    this.name = 'DomainInUseError';
  }
}

const baseDomain = process.env.BASE_DOMAIN || 'blogs.ecency.com';

// Roles that may claim a community's hosted instance. Mods moderate content but
// do not control the community's identity, so they are deliberately excluded.
/**
 * Hive names a community account hive-NNNN. Shared so every path that can bring
 * a tenant into existence recognises a community claim the same way.
 */
export const COMMUNITY_NAME = /^hive-\d+$/;

const CONTROLLING_COMMUNITY_ROLES = new Set(['owner', 'admin']);

/**
 * A value the server did not store, reported back to the caller.
 *
 * Identity fields are pinned and shape-mismatched values are dropped, both silently: the save
 * answered 200 while the stored config disagreed with what the editor was showing, and the
 * owner had no way to find out. Every drop is collected here and returned by the PATCH.
 */
export interface DiscardedField {
  /** Dot path of the value inside the config document the caller sent. */
  path: string;
  reason: string;
}

/** Where the guarded merge currently is, and where to record what it drops. */
interface MergeReport {
  path: string;
  discarded: DiscardedField[];
}

/**
 * Instance fields the server owns. A config save never stores what the client sent for these
 * (sanitizeConfigDocument pins them from the tenant row), and a reset must not be able to
 * remove one either: they are the same list so a field pinned in one place cannot be reached
 * through the other.
 */
export const PINNED_INSTANCE_FIELDS = ['username', 'owner', 'type', 'communityId'] as const;

/**
 * Shape of a resettable path: a dot path into the configuration document, spelled exactly as
 * the `discarded` channel reports it, so a client can send back the path it was told about.
 * Requires at least one segment below `configuration`, and every segment to start with a
 * letter, which keeps array indices and the prototype-pollution keys out.
 */
export const CONFIG_RESET_PATH = /^configuration(\.[A-Za-z][A-Za-z0-9_-]*)+$/;

/** Keys that must never be walked, whatever the path regex allows. */
const RESERVED_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

/** Ceiling on how many paths one save may reset. Repair is field-by-field, never a sweep. */
export const MAX_RESET_PATHS = 32;

/** What resetConfigPaths decided to do with one requested path. */
type ResetVerdict =
  | { action: 'clear' }
  | { action: 'skip' }
  | { action: 'refuse'; reason: string };

/**
 * Post filters each instance type can actually serve.
 *
 * A blog instance queries bridge.get_account_posts, whose sort must be one of these; a
 * community instance queries bridge.get_ranked_posts through the SPA's tab mapping. They do not
 * overlap except on 'payout', so filters carried over from the other type are not a cosmetic
 * mismatch: every feed tab on the instance errors. The instance type is pinned server-side, so
 * filters that contradict the pinned type are dropped rather than stored.
 */
export const POSTS_FILTERS_BY_TYPE: Record<'blog' | 'community', readonly string[]> = {
  blog: ['blog', 'feed', 'posts', 'comments', 'replies', 'payout'],
  community: ['trending', 'hot', 'created', 'new', 'payout', 'muted'],
};

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

/**
 * What makes a custom-domain claim releasable, as SQL over `tenants`.
 *
 * Emitted from one place because releaseUnverifiedDomains applies it twice, in statements whose
 * placeholder numbering differs: the two must not drift, or the re-check that protects a claim
 * made mid-sweep would be asking a different question from the one that selected it.
 * `claimDaysParam` is the 1-based placeholder holding the claim window in days.
 */
function unverifiedClaimPredicate(claimDaysParam: number): string {
  return `custom_domain IS NOT NULL
            AND custom_domain_verified = false
            AND NOT EXISTS (
                  SELECT 1 FROM domain_verifications dv
                   WHERE dv.tenant_id = tenants.id
                     AND dv.domain = tenants.custom_domain
                     AND dv.created_at > NOW() - ($${claimDaysParam} * INTERVAL '1 day')
                )`;
}

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
   *
   * `resetPaths` names values whose STORED copy is to be dropped before the merge, so the
   * document's value lands in an absent slot. That is the only way to repair a value stored
   * with the wrong type: the merge refuses any replacement that disagrees with what is stored,
   * which is deliberate (a string "false" must never stand in for a boolean), but it also
   * freezes a key that already holds the wrong type. See resetConfigPaths for the guarantees.
   */
  async applyConfigDocument(
    username: string,
    doc: any,
    resetPaths: readonly string[] = []
  ): Promise<{ tenant: Tenant; discarded: DiscardedField[]; reset: string[] }> {
    const tenant = await this.getByUsername(username);
    if (!tenant) throw new Error('Tenant not found');

    const current = tenant.config?.configuration?.instanceConfiguration || {};
    // Every value the server refuses to store is collected here and returned to the caller, so
    // the editor can tell the owner instead of showing a save that silently disagreed with it.
    const discarded: DiscardedField[] = [];
    // Identity comes from the tenant ROW (authorization's source of truth), never from the
    // stored config JSON, which could carry stale values from before the owner column.
    const clean = this.sanitizeConfigDocument(
      doc,
      {
        version: tenant.config?.version ?? 1,
        username: tenant.username,
        owner: tenant.owner,
        type: current.type ?? 'blog',
        communityId: current.communityId ?? '',
      },
      discarded
    );
    // Reset first, against the stored config and the already-sanitized document: identity
    // fields are pinned into `clean` above, so a reset can never make one of them absent and
    // let the client's value through.
    const { config: base, reset } = this.resetConfigPaths(
      tenant.config,
      resetPaths,
      clean,
      discarded
    );
    const newConfig = this.mergeConfigGuarded(base, clean, { path: '', discarded });

    const row = await db.queryOne<TenantRow>(
      `UPDATE tenants
       SET config = $2,
           updated_at = NOW()
       WHERE username = $1
       RETURNING *`,
      [username.toLowerCase(), JSON.stringify(newConfig)]
    );

    return { tenant: mapTenantFromDb(row!), discarded, reset };
  },

  /**
   * Drop the stored value at each requested path so the accompanying document can write a
   * correctly typed one into the now-absent slot (the merge takes any value where nothing is
   * stored). Returns the config to merge into, plus the paths actually cleared. Pure apart
   * from the report; the input config is never mutated.
   *
   * A reset is the only way past the type guard, so it is deliberately the narrowest operation
   * that repairs a stuck field. Five conditions must all hold, and the last one is what makes
   * this safe to ship: a reset cannot change the outcome of a save that would have succeeded
   * anyway.
   *
   *  1. The path is a well-formed path into `configuration`, so `version` and the document
   *     root are out of reach.
   *  2. It does not name a pinned identity field, which the server owns.
   *  3. The document being saved carries a value at that same path. A reset never removes a
   *     setting, it only replaces one, so it cannot be used to wipe config and cannot leave
   *     the served file with a hole. A null in the document is stripped before this runs, so
   *     "the value happens to be null" never reads as a reset.
   *  4. The stored value is not a section (a non-empty object). Sections are repaired one
   *     value at a time; no single request can drop a subtree.
   *  5. The stored value actually blocks the document's value. Where the save would have
   *     applied normally, the reset is a no-op.
   *
   * Not covered: a non-empty object stored where a scalar belongs stays stuck, because
   * clearing it would be exactly the "replace a whole section with one value" move that
   * condition 4 exists to prevent. Reaching that state takes a hand-written PATCH into a key
   * the stored config did not have.
   */
  resetConfigPaths(
    stored: any,
    paths: readonly string[] | undefined,
    document: any,
    discarded?: DiscardedField[]
  ): { config: any; reset: string[] } {
    const reset: string[] = [];
    if (!Array.isArray(paths) || paths.length === 0) return { config: stored, reset };
    if (paths.length > MAX_RESET_PATHS) {
      // All or nothing past the ceiling. A caller sending that many is not repairing fields one
      // by one, and applying the first few of a list it did not mean is the worst answer.
      console.warn('[TenantService] Refused config reset, too many paths:', paths.length);
      discarded?.push({
        path: 'reset',
        reason: `at most ${MAX_RESET_PATHS} values can be reset in one save`,
      });
      return { config: stored, reset };
    }

    let config = stored;
    for (const requested of paths) {
      const path = typeof requested === 'string' ? requested : String(requested);
      const verdict = this.resetVerdict(config, path, document);
      if (verdict.action === 'refuse') {
        console.warn('[TenantService] Refused config reset for path:', path);
        discarded?.push({ path, reason: verdict.reason });
        continue;
      }
      if (verdict.action === 'skip') continue;
      config = this.deletePath(config, path.split('.'));
      reset.push(path);
    }

    return { config, reset };
  },

  /** Decide what to do with one requested reset path. Pure. */
  resetVerdict(config: any, path: string, document: any): ResetVerdict {
    const segments = path.split('.');
    if (!CONFIG_RESET_PATH.test(path) || segments.some((s) => RESERVED_PATH_SEGMENTS.has(s))) {
      return { action: 'refuse', reason: 'not a value inside the configuration document' };
    }
    if (
      segments.length >= 3 &&
      segments[1] === 'instanceConfiguration' &&
      (PINNED_INSTANCE_FIELDS as readonly string[]).includes(segments[2])
    ) {
      return { action: 'refuse', reason: 'this field is set by the server and cannot be reset' };
    }

    const incoming = this.readPath(document, segments);
    if (incoming === undefined) {
      return {
        action: 'refuse',
        reason: 'the saved document carries no replacement value for this field',
      };
    }

    const current = this.readPath(config, segments);
    // Nothing stored: the save already writes straight into the empty slot.
    if (current === undefined) return { action: 'skip' };
    const currentIsSection =
      !!current &&
      typeof current === 'object' &&
      !Array.isArray(current) &&
      Object.keys(current).length > 0;
    if (currentIsSection) {
      return {
        action: 'refuse',
        reason: 'a section cannot be reset, only the individual values inside it',
      };
    }
    // The stored value already accepts what is being saved, so there is nothing to repair.
    if (!this.mergeRefuses(current, incoming)) return { action: 'skip' };

    return { action: 'clear' };
  },

  /**
   * Read the value at a dot path, or undefined if any step is missing or not an object.
   * Own properties only, so nothing inherited can be read as stored config. Pure.
   */
  readPath(node: any, segments: readonly string[]): any {
    let current = node;
    for (const segment of segments) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
      if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
      current = current[segment];
    }
    return current;
  },

  /**
   * Copy `node` without the value at the dot path. Only the objects along the path are copied;
   * everything else is shared with the input, which is left untouched. Pure.
   */
  deletePath(node: any, segments: readonly string[]): any {
    const [head, ...rest] = segments;
    const copy = Object.assign(Object.create(null), node);
    if (rest.length === 0) {
      delete copy[head];
    } else {
      copy[head] = this.deletePath(node[head], rest);
    }
    return copy;
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
  mergeConfigGuarded(base: any, updates: any, ctx?: MergeReport): any {
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
      const child = ctx
        ? { path: ctx.path ? `${ctx.path}.${key}` : key, discarded: ctx.discarded }
        : undefined;

      if (stored === undefined || stored === null) {
        // No stored shape to agree with; take the incoming value.
        result[key] = incomingIsPlainObject
          ? this.mergeConfigGuarded(Object.create(null), incoming, child)
          : incoming;
      } else if (this.mergeRefuses(stored, incoming)) {
        this.reportTypeMismatch(child, key);
      } else if (typeof stored === 'object' && !Array.isArray(stored)) {
        result[key] = this.mergeConfigGuarded(stored, incoming, child);
      } else {
        result[key] = incoming;
      }
    }

    return result;
  },

  /**
   * Whether the guarded merge would refuse `incoming` in place of `stored`: an object section
   * only takes an object, an array only a valid array, and a scalar only a scalar of the same
   * primitive type, so a string "false" cannot stand in for a boolean nor 42 for a string.
   *
   * The single statement of the rule. resetConfigPaths asks the same question to decide whether
   * a stored value is actually blocking a save, and the two must not drift: a reset that fired
   * where the merge would have accepted the value would be clearing a healthy field. Pure.
   */
  mergeRefuses(stored: any, incoming: any): boolean {
    // An absent or null slot takes anything; this is what a reset creates.
    if (stored === undefined || stored === null) return false;
    const incomingIsPlainObject =
      !!incoming && typeof incoming === 'object' && !Array.isArray(incoming);
    const incomingIsArray = Array.isArray(incoming);
    if (typeof stored === 'object' && !Array.isArray(stored)) return !incomingIsPlainObject;
    if (Array.isArray(stored)) {
      return !incomingIsArray || !this.isValidArrayReplacement(stored, incoming);
    }
    return incomingIsPlainObject || incomingIsArray || typeof incoming !== typeof stored;
  },

  /** Log a dropped value and, when the caller asked for a report, record it for the response. */
  reportTypeMismatch(child: MergeReport | undefined, key: string): void {
    console.warn('[TenantService] Dropped type-mismatched config value for key:', key);
    if (child) {
      child.discarded.push({
        path: child.path,
        reason: 'value does not match the type of the stored setting',
      });
    }
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
    pins: { version: number; username: string; owner: string; type: string; communityId: string },
    discarded?: DiscardedField[]
  ): any {
    const clean = this.mergeConfig(Object.create(null), this.stripNulls(doc || {}));
    if (clean.version !== undefined && clean.version !== pins.version) {
      discarded?.push({ path: 'version', reason: 'the config version is set by the server' });
    }
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
      throw new ApiError(400, 'Invalid configuration document');
    }
    const instance = (clean.configuration.instanceConfiguration =
      clean.configuration.instanceConfiguration &&
      typeof clean.configuration.instanceConfiguration === 'object'
        ? clean.configuration.instanceConfiguration
        : Object.create(null));

    // Report a pin only when the client actually sent something different. The editor loads
    // the served config and sends it back, so the identity fields normally match and produce
    // no report; a genuine attempt to change one (switching the instance type) does.
    const pinReasons: Record<string, string> = {
      username: 'the showcased account is set by the server',
      owner: 'the controlling account is set by the server',
      type: 'the instance type is set when the instance is created and cannot be changed here',
      communityId: 'the community id is set by the server',
    };
    for (const key of PINNED_INSTANCE_FIELDS) {
      if (instance[key] !== undefined && instance[key] !== pins[key]) {
        discarded?.push({
          path: `configuration.instanceConfiguration.${key}`,
          reason: pinReasons[key],
        });
      }
    }

    for (const key of PINNED_INSTANCE_FIELDS) {
      instance[key] = pins[key];
    }
    // Served-only marker (injected at config-file generation); must never round-trip from a
    // client document into the stored config.
    delete instance.managed;

    // Post filters are checked AFTER the type is pinned, against the pinned type: a document
    // that switches the instance type carries the other type's filters with it, and storing
    // those while the type stays put leaves every feed tab querying a sort its API rejects.
    this.normalizePostsFilters(instance, pins.type, discarded);

    return clean;
  },

  /**
   * Drop post filters the pinned instance type cannot serve.
   *
   * If nothing valid is left the key is removed entirely rather than stored empty, so the merge
   * keeps whatever the instance already had: an instance with no filters at all has no feed.
   * Mutates `instance` in place; the caller owns the freshly-sanitized copy.
   */
  normalizePostsFilters(instance: any, type: string, discarded?: DiscardedField[]): void {
    const features = instance?.features;
    if (!features || typeof features !== 'object' || Array.isArray(features)) return;
    if (!Array.isArray(features.postsFilters)) return;

    const allowed = POSTS_FILTERS_BY_TYPE[type === 'community' ? 'community' : 'blog'];
    const kept = features.postsFilters.filter(
      (filter: unknown) => typeof filter === 'string' && allowed.includes(filter)
    );
    if (kept.length === features.postsFilters.length) return;

    const dropped = features.postsFilters.filter((filter: unknown) => !kept.includes(filter));
    discarded?.push({
      path: 'configuration.instanceConfiguration.features.postsFilters',
      reason: `${JSON.stringify(dropped)} cannot be served by a ${
        type === 'community' ? 'community' : 'blog'
      } instance`,
    });

    if (kept.length > 0) {
      features.postsFilters = kept;
    } else {
      delete features.postsFilters;
    }
  },
  
  /**
   * Claim half of a custom-domain attach: point the tenant row at the domain.
   *
   * Runs on a caller-supplied executor and is deliberately NOT a standalone entry point.
   * A claim without the verification record that dates it is exactly the state the release
   * sweep reads as expired, so the two belong in one transaction: go through
   * DomainService.attachDomain, which is what both rails call.
   */
  async setCustomDomain(exec: SqlExecutor, username: string, domain: string): Promise<Tenant> {
    let row: TenantRow | undefined;

    try {
      // Re-submitting the domain the tenant already holds keeps its verification.
      // Decided inside the statement rather than from an earlier read: a route
      // level guard would be check-then-act, and a concurrent update could make
      // the read stale between the two. Setting a DIFFERENT domain still clears
      // the flag, which is what re-verification exists for.
      const result = await exec.query<TenantRow>(
        `UPDATE tenants
         SET custom_domain = $2,
             custom_domain_verified =
               CASE WHEN custom_domain = $2 THEN custom_domain_verified ELSE false END,
             custom_domain_verified_at =
               CASE WHEN custom_domain = $2 THEN custom_domain_verified_at ELSE NULL END,
             updated_at = NOW()
         WHERE username = $1
         RETURNING *`,
        [username.toLowerCase(), domain.toLowerCase()]
      );
      row = result.rows[0];
    } catch (error) {
      // custom_domain is UNIQUE. Losing the race to another tenant is a
      // conflict, not a server error: without this the raw Postgres message
      // surfaced as a 500 and the caller could not tell why.
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new DomainInUseError(domain);
      }
      throw error;
    }

    if (!row) throw new Error('Tenant not found');
    return mapTenantFromDb(row);
  },
  
  /**
   * Verify custom domain
   */
  /**
   * Marks the domain that was actually checked, not whatever the row holds now.
   *
   * Verification does a DNS round trip between reading the tenant and writing
   * the flag. Keying the update on the username alone let a domain swap during
   * that window inherit the result of a check performed against the previous
   * domain, which also added it to the CORS allowlist and blocked its rightful
   * owner. Returns null when the row moved on, so the caller can ask the user
   * to verify again.
   */
  async verifyCustomDomain(username: string, domain: string): Promise<Tenant | null> {
    const row = await db.queryOne<TenantRow>(
      `UPDATE tenants
       SET custom_domain_verified = true,
           custom_domain_verified_at = NOW(),
           updated_at = NOW()
       WHERE username = $1 AND custom_domain = $2
       RETURNING *`,
      [username.toLowerCase(), domain.toLowerCase()]
    );

    return row ? mapTenantFromDb(row) : null;
  },

  /**
   * Whether any tenant holds this domain, verified or not.
   *
   * getByDomain deliberately matches verified rows only, because that is what
   * serving a request by host means. Occupancy is a different question: the
   * column is UNIQUE regardless of the flag, so an unverified reservation still
   * blocks everyone else, and checking only verified rows let the insert fail
   * on the constraint instead of returning a clean conflict.
   */
  async isDomainClaimed(domain: string, excludeUsername?: string): Promise<boolean> {
    const row = await db.queryOne<{ username: string }>(
      'SELECT username FROM tenants WHERE custom_domain = $1',
      [domain.toLowerCase()]
    );

    if (!row) return false;
    return row.username.toLowerCase() !== excludeUsername?.toLowerCase();
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
   * Release custom-domain claims that were never verified.
   *
   * custom_domain is UNIQUE whether or not it is verified, so a tenant could claim a domain,
   * never point DNS at it, and hold it against its rightful owner forever: nothing expired the
   * claim. The verification RECORD had a 7-day expiry, but nothing acted on it and clearing it
   * would not have freed the column anyway.
   *
   * A claim is released when no verification record for that exact domain has been created
   * within `claimDays`. The attach writes that record in the same transaction as the claim, so
   * it dates every claim without needing a new column (migrations here are applied by hand, and
   * a column the code required would 500 every request until someone ran the SQL). The attach
   * keeps the EARLIEST record for a domain the tenant already
   * holds, so re-submitting the same domain no longer restarts this clock: a squatter cannot
   * hold a domain past claimDays by re-posting it, while an owner still working on DNS has the
   * whole window from the moment they first asked for it.
   *
   * Nothing else can postpone a release either. The tenant row's updated_at is deliberately not
   * consulted: it moves on every unrelated write (a config save bumps it through a trigger), so
   * dating a claim by it let an account that saved often keep an unverifiable domain forever.
   *
   * Only unverified claims are touched, so a verified domain is never unbound and no serving
   * site is affected. Idempotent: a released row has custom_domain NULL and cannot match again.
   *
   * Candidates are selected FOR UPDATE and cleared in the same transaction, which is what makes
   * a verification racing the sweep safe in both directions. If the verification commits first,
   * the locked re-read sees custom_domain_verified = true and the row is no longer a candidate,
   * so a domain that was just proven is never unbound. If the sweep commits first, the
   * verification's own UPDATE is keyed on username AND domain, matches no row, returns null, and
   * both rails already answer "verify again" for that.
   *
   * The UPDATE repeats the whole predicate rather than trusting the ids the SELECT returned.
   * Under READ COMMITTED, a row that was being updated when the SELECT reached it is re-checked
   * against the updated version, but subqueries in that re-check still run on the statement's
   * ORIGINAL snapshot. So an attach that commits while the sweep waits for its lock is invisible
   * to the NOT EXISTS, and a domain claimed a moment ago would be unbound. The UPDATE is a new
   * statement on already-locked rows: it takes a fresh snapshot, sees the committed record, and
   * simply matches nothing. RETURNING then reports which rows were actually cleared.
   *
   * The claim is read before it is cleared rather than from RETURNING, which reports the NEW row
   * and would hand back a null domain for every release.
   */
  async releaseUnverifiedDomains(claimDays: number): Promise<{ username: string; domain: string }[]> {
    return db.transaction(async (client) => {
      const candidates = await client.query<{ id: string; username: string; custom_domain: string }>(
        `SELECT id, username, custom_domain
           FROM tenants
          WHERE ${unverifiedClaimPredicate(1)}
          FOR UPDATE`,
        [claimDays]
      );

      if (candidates.rows.length === 0) return [];
      const ids = candidates.rows.map((row) => row.id);

      const cleared = await client.query<{ id: string }>(
        `UPDATE tenants
            SET custom_domain = NULL,
                custom_domain_verified = false,
                custom_domain_verified_at = NULL,
                updated_at = NOW()
          WHERE id = ANY($1::uuid[])
            AND ${unverifiedClaimPredicate(2)}
          RETURNING id`,
        [ids, claimDays]
      );

      if (cleared.rows.length === 0) return [];
      const releasedIds = new Set(cleared.rows.map((row) => row.id));

      // Drop the stale records with the claim they belonged to, in the same transaction, so the
      // two can never disagree about whether a claim exists. Verified records are left alone.
      await client.query(
        `DELETE FROM domain_verifications
          WHERE tenant_id = ANY($1::uuid[]) AND verified = false`,
        [[...releasedIds]]
      );

      return candidates.rows
        .filter((row) => releasedIds.has(row.id))
        .map((row) => ({
          username: row.username,
          domain: row.custom_domain,
        }));
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
          // Empty means the built-in composer at /publish, so a new blog owner
          // writes on their own domain. Only an owner who fills this in is sent
          // to an external composer.
          createPostUrl: '',
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
            // How much of the Hive blockchain a reader sees. A new blog shows
            // what each post earned, when its payout window closes, and a link
            // to its record on chain; no feed payouts, no vote-weight picker,
            // no downvotes. Every tenant created before this carries no `hive`
            // block at all and resolves to `off`, so seeding it here changes
            // nothing for them: getDefaultConfig is reached only through
            // buildConfig, which is called only at tenant creation.
            hive: {
              readerLayer: 'standard',
              authorRewards: 'author',
            },
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

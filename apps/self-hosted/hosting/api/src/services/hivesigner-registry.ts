/**
 * Hivesigner registration state, and turning the login method on for exactly the
 * instances it can actually complete a login for.
 *
 * Hivesigner matches an OAuth callback with `redirect_uris.includes(callback)`
 * against the app account's on-chain `posting_json_metadata`. Exact string
 * match, no wildcards, no origin matching, so an instance whose `/auth` URI is
 * not listed verbatim cannot log anyone in. The SPA hides the method unless the
 * instance names a client id, which is why a hosted blog offers Keychain and
 * HiveAuth only until its URI is registered.
 *
 * The client id must therefore never be set for an instance whose URI is not on
 * chain: that is precisely the state that produces a login button leading to an
 * error page with no explanation. This module is what makes the two inseparable.
 * It reads the array from the chain and derives each tenant's required URIs from
 * its own row, so a client id is written only for a tenant whose registration
 * this service has confirmed for itself. Nothing a caller sends can influence
 * that decision, because nothing a caller sends is read.
 *
 * NO SIGNING HAPPENS HERE. Adding a URI is an `account_update2` broadcast under
 * the app account's posting authority, and this service is internet-facing and
 * holds tenant data, so it has never held a key and does not gain one for this.
 * The broadcast runs as a scheduled job elsewhere (see
 * hosting/scripts/hivesigner-redirect-uris.py) and pokes this reconcile
 * afterwards. `no-signing-capability.test.ts` holds that line.
 */

import { callRPC } from '@ecency/sdk/hive';
import { db } from '../db/client';
import { TenantService } from './tenant-service';
import { ConfigService, isPublishableTenant } from './config-service';
import { mapTenantFromDb, type Tenant, type TenantRow } from '../types';

/**
 * The shared Hivesigner app. This is the only client id this service manages: an
 * owner who registered an app of their own owns that value and it is left alone.
 */
export const HIVESIGNER_APP_ACCOUNT = (
  process.env.HIVESIGNER_APP_ACCOUNT || 'ecency.app'
).toLowerCase();

const baseDomain = process.env.BASE_DOMAIN || 'blogs.ecency.com';

/** Where the SPA takes a Hivesigner callback; must match HIVESIGNER_REDIRECT_PATH. */
const REDIRECT_PATH = '/auth';

/** Dot path of the client id inside a stored tenant config. */
export const CLIENT_ID_PATH = ['configuration', 'general', 'hivesigner', 'clientId'] as const;

/**
 * Every origin a tenant's served config is reachable on, and therefore every URI
 * that has to be registered before the method may be offered.
 *
 * One config file serves both the tenant subdomain and a verified custom domain,
 * and the SPA builds its redirect_uri from `window.location.origin`. So a client
 * id set while only one of the two is registered gives visitors on the other a
 * button that fails, which is the exact state this exists to prevent. Both or
 * neither.
 *
 * An UNVERIFIED custom domain is deliberately not included. The claim is only a
 * string in a column until DNS proves it; registering it would let whoever
 * actually controls that name receive callbacks carrying access tokens for the
 * app. It joins the list when verification succeeds, not when it is asked for.
 *
 * This rule is mirrored by hosting/scripts/hivesigner-redirect-uris.py, which
 * decides what to put ON chain. The two are allowed to drift only in the safe
 * direction: this side derives what it REQUIRES and checks the chain for it, so
 * a script that registers too little leaves the method off, and one that
 * registers too much enables nothing extra. Neither divergence can produce a
 * broken button.
 */
export function tenantRedirectUris(
  tenant: Pick<Tenant, 'username' | 'customDomain' | 'customDomainVerified'>,
  base: string = baseDomain
): string[] {
  const uris = [`https://${tenant.username.toLowerCase()}.${base}${REDIRECT_PATH}`];
  if (tenant.customDomain && tenant.customDomainVerified) {
    uris.push(`https://${tenant.customDomain.toLowerCase()}${REDIRECT_PATH}`);
  }
  return uris;
}

/**
 * The registered URIs carried by an account's `posting_json_metadata`.
 *
 * Throws rather than returning an empty list for metadata it cannot read. An
 * empty result is a legitimate answer for an app that has registered nothing,
 * and it disables every tenant, so a parse failure must never be able to
 * impersonate one: a malformed document, a truncated RPC response or a
 * `redirect_uris` that is not an array would otherwise switch the login method
 * off across the whole fleet in a single pass.
 */
export function parseRegisteredRedirectUris(postingJsonMetadata: unknown): string[] {
  if (typeof postingJsonMetadata !== 'string' || postingJsonMetadata.trim() === '') {
    throw new Error('account has no posting_json_metadata');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(postingJsonMetadata);
  } catch {
    throw new Error('posting_json_metadata is not valid JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('posting_json_metadata is not an object');
  }
  const profile = (parsed as Record<string, unknown>).profile;
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error('posting_json_metadata carries no profile');
  }
  const uris = (profile as Record<string, unknown>).redirect_uris;
  // Absent is a real "nothing is registered"; present-but-not-an-array is a
  // document this code does not understand and must not act on.
  if (uris === undefined) return [];
  if (!Array.isArray(uris)) {
    throw new Error('redirect_uris is not an array');
  }
  return uris.filter((uri): uri is string => typeof uri === 'string');
}

/** Read the app account's registered redirect URIs from the chain. */
export async function fetchRegisteredRedirectUris(
  account: string = HIVESIGNER_APP_ACCOUNT
): Promise<string[]> {
  const accounts = (await callRPC('condenser_api.get_accounts', [[account]])) as
    | { posting_json_metadata?: unknown }[]
    | null;
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error(`app account ${account} does not exist`);
  }
  return parseRegisteredRedirectUris(accounts[0]?.posting_json_metadata);
}

/** What a reconcile pass should do with one tenant's stored client id. */
export type ClientIdAction = 'enable' | 'disable' | 'leave';

/**
 * Decide a tenant's client id from the registration, and nothing else.
 *
 * `enable` only when every URI the instance is served on is on chain, so the
 * value can never exist ahead of the registration. `disable` is the same rule
 * read backwards: a client id this service set for a URI that has since left the
 * array is withdrawn, so a hand-edit on chain cannot leave a broken button
 * behind. Both directions run every pass, which is what makes a run that failed
 * halfway repair itself on the next one rather than needing anybody.
 *
 * A value that is neither blank nor the shared app is the owner's own Hivesigner
 * app, registered by them against URIs this service knows nothing about. It is
 * never touched: managing it would mean deleting a working login.
 */
export function decideClientId(
  storedClientId: unknown,
  requiredUris: readonly string[],
  registered: ReadonlySet<string>,
  appAccount: string = HIVESIGNER_APP_ACCOUNT
): ClientIdAction {
  const current = typeof storedClientId === 'string' ? storedClientId.trim().toLowerCase() : '';
  if (current !== '' && current !== appAccount) return 'leave';

  // An empty required list would make `every` vacuously true and enable a tenant
  // with nothing registered at all.
  const fullyRegistered =
    requiredUris.length > 0 && requiredUris.every((uri) => registered.has(uri));

  if (fullyRegistered) return current === appAccount ? 'leave' : 'enable';
  return current === '' ? 'leave' : 'disable';
}

/** Read a dot path out of a stored config, own properties only. */
function readPath(node: unknown, segments: readonly string[]): unknown {
  let current: unknown = node;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * The config document that carries a client id change.
 *
 * Disabling writes an empty string rather than removing the key: the guarded
 * merge has no delete, and `resolveHivesignerClientId` in the SPA already treats
 * a blank value as absent, so the method is hidden either way and the owner is
 * shown the same setup notice.
 */
export function clientIdDocument(clientId: string): Record<string, unknown> {
  return { configuration: { general: { hivesigner: { clientId } } } };
}

export interface ReconcileResult {
  account: string;
  /** How many URIs the app account currently has registered. */
  registered: number;
  enabled: string[];
  disabled: string[];
  /** Tenants whose stored client id already agreed with the chain. */
  unchanged: number;
  /** Tenants whose write failed; the next scheduled pass retries them. */
  failed: string[];
}

/**
 * Bring every served tenant's client id into agreement with the on-chain array.
 *
 * Reads the chain FIRST and aborts the whole pass if that read fails, because
 * the failure mode of guessing is switching the login method off for every
 * tenant at once. Individual writes are isolated the way `syncAllConfigs`
 * isolates them, so one bad tenant cannot cost the rest their pass.
 *
 * The config change goes through `applyConfigDocument`, the same guarded merge
 * and pinned identity fields a save from the Configuration Editor goes through.
 * Writing the row directly would be a config write that bypasses the service's
 * own rules, and those produce states nothing can repair.
 */
export async function reconcileHivesignerClientIds(
  appAccount: string = HIVESIGNER_APP_ACCOUNT
): Promise<ReconcileResult> {
  const registeredList = await fetchRegisteredRedirectUris(appAccount);
  const registered = new Set(registeredList);

  const tenants = await TenantService.getActiveTenants();

  const result: ReconcileResult = {
    account: appAccount,
    registered: registered.size,
    enabled: [],
    disabled: [],
    unchanged: 0,
    failed: [],
  };

  for (const tenant of tenants) {
    // Decided from the listing only to skip the tenants that plainly need
    // nothing, which in the steady state is all of them. The decision that is
    // acted on is taken again below, against a row nobody else can move.
    if (
      decideClientId(
        readPath(tenant.config, CLIENT_ID_PATH),
        tenantRedirectUris(tenant),
        registered,
        appAccount
      ) === 'leave'
    ) {
      result.unchanged++;
      continue;
    }

    try {
      const action = await applyClientIdForTenant(tenant.username, registered, appAccount);
      if (action === 'leave') {
        result.unchanged++;
        continue;
      }
      // Published BY NAME, never from the row the transaction returned.
      //
      // This is the same hazard the locked re-read above exists for, one step
      // later. The transaction commits, and in the moment before the file is
      // written an owner can save a config of their own; publishing the
      // committed snapshot then puts the older document on disk and leaves the
      // database holding the newer one. That split is worse than either value
      // being wrong on its own, because the row no longer explains what readers
      // are being served and nothing later notices the disagreement.
      //
      // publishConfigFile re-reads the row inside the per-tenant write lock, so
      // the file can only ever receive the newest committed config. It exists
      // because the payment listener had this exact bug and was fixed this way.
      await ConfigService.publishConfigFile(tenant.username);
      (action === 'enable' ? result.enabled : result.disabled).push(tenant.username);
    } catch (err) {
      console.error(
        `[HivesignerRegistry] client id update failed for ${tenant.username}:`,
        (err as Error).message
      );
      result.failed.push(tenant.username);
    }
  }

  return result;
}

/**
 * Decide and apply one tenant's client id against a row nobody else can move.
 *
 * The listing this loop iterates is a snapshot, and the two things the decision
 * reads can both change under it. If an owner saves a client id of their own in
 * that window, a decision taken from the snapshot writes the shared app over it
 * and the value is simply gone: the next pass sees the shared id, recognises it
 * as one it manages, and leaves it, so nothing ever puts the owner's app back.
 * If a custom domain is verified in that window, the tenant needs a second URI
 * that the snapshot did not know about, and enabling on the strength of the
 * first one is the broken button this whole design exists to avoid.
 *
 * So the row is re-read FOR UPDATE and the decision is taken again from it,
 * inside the transaction that then writes. A concurrent config save either
 * commits first and is what this decides from, or waits and lands on top; there
 * is no ordering in which its value is read and then discarded.
 *
 * Returns 'leave' when the fresh row no longer wants the change, which is the
 * normal outcome of losing that race and is not an error.
 *
 * Returns ONLY the action, deliberately. Handing the caller the row this wrote
 * is what makes the next step easy to get wrong: that object is accurate for as
 * long as the transaction, and stale from the instant it commits, but it looks
 * exactly like a tenant worth publishing. With nothing to publish from, the only
 * thing the caller can pass on is a name.
 */
async function applyClientIdForTenant(
  username: string,
  registered: ReadonlySet<string>,
  appAccount: string
): Promise<ClientIdAction> {
  return db.transaction(async (client) => {
    const locked = await client.query<TenantRow>(
      'SELECT * FROM tenants WHERE username = $1 FOR UPDATE',
      [username.toLowerCase()]
    );
    const row = locked.rows[0];
    if (!row) return 'leave' as ClientIdAction;

    const fresh = mapTenantFromDb(row);
    // Standing can have changed since the listing too, and a tenant that may no
    // longer be served should not be given a login method. The shared predicate,
    // so this agrees with every other publication path by construction rather
    // than by a copy of the rule that can drift.
    if (!isPublishableTenant(fresh)) return 'leave' as ClientIdAction;

    const action = decideClientId(
      readPath(fresh.config, CLIENT_ID_PATH),
      tenantRedirectUris(fresh),
      registered,
      appAccount
    );
    if (action === 'leave') return action;

    await TenantService.applyConfigDocument(
      username,
      clientIdDocument(action === 'enable' ? appAccount : ''),
      [],
      client
    );
    return action;
  });
}

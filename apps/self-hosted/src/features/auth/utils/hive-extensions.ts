/**
 * Unified Hive browser-extension abstraction for the self-hosted app.
 *
 * Adapted from the main web app's utils/hive-extensions.ts, including its
 * hard-won detection rules:
 * - Hive Unified Wallet Protocol registry (window.hive.providers[]) first,
 *   legacy per-global detection as fallback.
 * - Hive Keeper owns window.hive and flags it with isKeeper; that live object
 *   must be used directly (registry copies can be stale and hang requests).
 * - Keeper aliases itself onto window.hive_keychain for backward compatibility;
 *   the alias carries isKeeper and must not be surfaced as a phantom Keychain.
 * - Peak Vault exposes a promise-based API on window.peakvault and has no
 *   callback API for specialized requests (transaction signing).
 *
 * The chosen extension is remembered per username in localStorage (same keys
 * as the main app) so every signing path uses the wallet the account logged
 * in with.
 */

import type { Operation } from '@ecency/sdk';
import type { HiveExtensionId, KeychainResponse } from '../types';
import {
  broadcast as broadcastViaKeychain,
  signBuffer as signBufferViaKeychain,
  type AuthorityType,
  type HiveKeychain,
} from './keychain';

export type { HiveExtensionId } from '../types';

export interface DetectedExtension {
  id: HiveExtensionId;
  name: string;
  icon: string;
}

interface HiveWalletProvider {
  name: string;
  rdns: string;
  provider: unknown;
}

/** Keeper owns window.hive; other wallets may also register in its providers list. */
interface HiveGlobal extends HiveKeychain {
  isKeeper?: boolean;
  providers?: HiveWalletProvider[];
}

interface WindowWithExtensions {
  hive?: HiveGlobal;
  hive_keychain?: HiveKeychain & { isKeeper?: boolean };
  peakvault?: PeakVaultApi;
}

function win(): WindowWithExtensions | undefined {
  return typeof window === 'undefined'
    ? undefined
    : (window as unknown as WindowWithExtensions);
}

interface PeakVaultResponse {
  success: boolean;
  result?: string;
  error?: string;
}

interface PeakVaultApi {
  requestSignBuffer: (
    account: string,
    keyRole: 'posting' | 'active' | 'memo',
    message: string,
  ) => Promise<PeakVaultResponse>;
  requestBroadcast: (
    account: string,
    operations: Operation[],
    keyRole: 'posting' | 'active' | 'memo',
  ) => Promise<PeakVaultResponse>;
}

const EXTENSION_META: Record<HiveExtensionId, DetectedExtension> = {
  'hive-keeper': {
    id: 'hive-keeper',
    name: 'Hive Keeper',
    icon: '/assets/keeper.svg',
  },
  keychain: { id: 'keychain', name: 'Keychain', icon: '/assets/keychain.png' },
  peakvault: {
    id: 'peakvault',
    name: 'Peak Vault',
    icon: '/assets/peakvault.svg',
  },
};

/** Maps unified-protocol provider rdns to extension ids. */
const RDNS_MAP: Record<string, HiveExtensionId> = {
  'com.ecency.keeper': 'hive-keeper',
  'com.hivekeychain': 'keychain',
  'com.peakd.vault': 'peakvault',
};

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export function getDetectedExtensions(): DetectedExtension[] {
  const w = win();
  if (!w) return [];

  const seen = new Set<HiveExtensionId>();
  const detected: DetectedExtension[] = [];
  const add = (id: HiveExtensionId) => {
    if (!seen.has(id)) {
      seen.add(id);
      detected.push(EXTENSION_META[id]);
    }
  };

  const providers = w.hive?.providers;
  if (providers?.length) {
    for (const p of providers) {
      const id = RDNS_MAP[p.rdns];
      if (id) add(id);
    }
  }

  if (w.hive?.isKeeper) add('hive-keeper');
  // Skip Keeper's backward-compat self-alias (it carries isKeeper; a real
  // Keychain never does) so a Keeper-only browser doesn't show a phantom choice.
  if (w.hive_keychain && !w.hive_keychain.isKeeper) add('keychain');
  if (w.peakvault) add('peakvault');

  return detected;
}

export function hasAnyHiveExtension(): boolean {
  return getDetectedExtensions().length > 0;
}

/** Human-readable name for an extension id (e.g. for the user menu). */
export function getExtensionName(id: HiveExtensionId): string {
  return EXTENSION_META[id]?.name ?? id;
}

/** True when a Keychain-compatible (callback API) extension is present. */
export function hasKeychainLikeExtension(): boolean {
  return getDetectedExtensions().some((e) => e.id !== 'peakvault');
}

// ---------------------------------------------------------------------------
// Per-user preference (same storage keys as the main web app)
// ---------------------------------------------------------------------------

const PREFERRED_EXTENSION_MAP_KEY = 'ecency_preferred_hive_extension_by_user';

/**
 * Every extension this app knows how to sign with. Exported so callers that
 * have to cover all of them, such as the signing copy, cannot fall behind a
 * fourth wallet being added here.
 */
export const VALID_EXTENSION_IDS: readonly HiveExtensionId[] = [
  'keychain',
  'hive-keeper',
  'peakvault',
];

function asHiveExtensionId(value: unknown): HiveExtensionId | null {
  return typeof value === 'string' &&
    (VALID_EXTENSION_IDS as readonly string[]).includes(value)
    ? (value as HiveExtensionId)
    : null;
}

function readPreferenceMap(): Record<string, HiveExtensionId> {
  try {
    const raw = localStorage.getItem(PREFERRED_EXTENSION_MAP_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return {};
    const clean: Record<string, HiveExtensionId> = {};
    for (const [user, id] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      const valid = asHiveExtensionId(id);
      if (valid) clean[user] = valid;
    }
    return clean;
  } catch {
    return {};
  }
}

export function setPreferredExtensionId(
  username: string,
  id: HiveExtensionId | null,
): void {
  if (typeof window === 'undefined' || !username) return;
  try {
    const map = readPreferenceMap();
    if (id) {
      map[username] = id;
    } else {
      delete map[username];
    }
    localStorage.setItem(PREFERRED_EXTENSION_MAP_KEY, JSON.stringify(map));
  } catch {
    // Storage blocked (private browsing): non-fatal, the session keeps working.
  }
}

export function getPreferredExtensionId(
  username?: string,
): HiveExtensionId | null {
  if (typeof window === 'undefined' || !username) return null;
  try {
    return readPreferenceMap()[username] ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Instance access
// ---------------------------------------------------------------------------

function getProviderByRdns<T>(rdns: string): T | null {
  const providers = win()?.hive?.providers;
  return (
    (providers?.find((p) => p.rdns === rdns)?.provider as T | undefined) ?? null
  );
}

function getHiveKeeperInstance(): HiveKeychain | null {
  const w = win();
  if (!w) return null;
  // Prefer the live window.hive object Keeper wired its response listener to;
  // registry copies can be stale and hang on a dead 60s timeout.
  if (w.hive?.isKeeper) return w.hive;
  return getProviderByRdns<HiveKeychain>('com.ecency.keeper');
}

function getKeychainInstance(): HiveKeychain | null {
  const w = win();
  if (!w) return null;
  const fromRegistry = getProviderByRdns<HiveKeychain>('com.hivekeychain');
  if (fromRegistry) return fromRegistry;
  // Never return Keeper's self-alias as "Keychain" (see detection notes).
  return w.hive_keychain && !w.hive_keychain.isKeeper ? w.hive_keychain : null;
}

function getPeakVaultInstance(): PeakVaultApi | null {
  const w = win();
  if (!w) return null;
  return (
    getProviderByRdns<PeakVaultApi>('com.peakd.vault') ?? w.peakvault ?? null
  );
}

/**
 * Resolve the Keychain-compatible instance for an account, honoring its saved
 * preference. A "keychain" preference resolves strictly to the real Keychain
 * (not Keeper's alias). A "peakvault" preference resolves to NULL: Peak Vault
 * has no callback API for the specialized requests that need this instance
 * (transaction signing), and silently prompting a different wallet than the
 * one the user chose is worse than a clear error. No preference falls through
 * to Keeper-first auto-detect.
 */
export function resolveKeychainLikeInstance(
  username?: string,
): HiveKeychain | null {
  if (typeof window === 'undefined') return null;
  const extId = getPreferredExtensionId(username);
  if (extId === 'keychain') return getKeychainInstance();
  if (extId === 'hive-keeper') return getHiveKeeperInstance();
  if (extId === 'peakvault') return null;
  return getHiveKeeperInstance() || getKeychainInstance();
}

// ---------------------------------------------------------------------------
// Unified sign / broadcast
// ---------------------------------------------------------------------------

const NO_EXTENSION_ERROR =
  'No Hive browser extension found. Please install Hive Keeper, Keychain, or Peak Vault.';

/**
 * Fast liveness ping (ported from the main app). Keychain-compatible extensions
 * run a Manifest V3 service worker that idles after ~30s; the first request to
 * a sleeping or crashed worker can silently never call back. requestHandshake
 * wakes the worker so a genuinely dead one fails fast with an actionable
 * message. Resolves for instances without requestHandshake.
 */
function pingKeychain(keychain: HiveKeychain, timeoutMs = 6000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof keychain.requestHandshake !== 'function') {
      resolve();
      return;
    }
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      reject(
        new Error(
          'Extension is not responding. Click its icon to wake it, then try again.',
        ),
      );
    };
    const timeoutId = setTimeout(fail, timeoutMs);
    try {
      keychain.requestHandshake(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve();
      });
    } catch {
      clearTimeout(timeoutId);
      fail();
    }
  });
}

async function signViaKeychainLike(
  instance: HiveKeychain,
  account: string,
  message: string,
  authType: AuthorityType,
): Promise<KeychainResponse> {
  await pingKeychain(instance);
  return signBufferViaKeychain(account, message, authType, instance);
}

async function broadcastViaKeychainLike(
  instance: HiveKeychain,
  account: string,
  operations: Operation[],
  authType: AuthorityType,
): Promise<KeychainResponse> {
  await pingKeychain(instance);
  return broadcastViaKeychain(account, operations, authType, instance);
}

async function signBufferViaPeakVault(
  peakvault: PeakVaultApi,
  account: string,
  message: string,
  authType: AuthorityType,
): Promise<KeychainResponse> {
  const keyRole = authType.toLowerCase();
  if (keyRole === 'owner') {
    throw new Error('Owner authority is not supported by Peak Vault.');
  }
  const resp = await peakvault.requestSignBuffer(
    account,
    keyRole as 'posting' | 'active' | 'memo',
    message,
  );
  if (!resp.success) {
    throw new Error(resp.error || 'Operation cancelled');
  }
  return { success: true, result: resp.result };
}

async function broadcastViaPeakVault(
  peakvault: PeakVaultApi,
  account: string,
  operations: Operation[],
  authType: AuthorityType,
): Promise<KeychainResponse> {
  const keyRole = authType.toLowerCase();
  if (keyRole === 'owner') {
    throw new Error('Owner authority is not supported by Peak Vault.');
  }
  const resp = await peakvault.requestBroadcast(
    account,
    operations,
    keyRole as 'posting' | 'active' | 'memo',
  );
  if (!resp.success) {
    throw new Error(resp.error || 'Extension broadcast failed');
  }
  return { success: true, result: resp.result };
}

/**
 * Sign a message with the account's chosen extension (or the best available).
 * `preferredId` overrides the stored preference, e.g. during login before the
 * choice is persisted.
 */
export function signBufferWithExtension(
  account: string,
  message: string,
  authType: AuthorityType = 'Posting',
  preferredId?: HiveExtensionId,
): Promise<KeychainResponse> {
  const extId = preferredId ?? getPreferredExtensionId(account);
  if (extId === 'peakvault') {
    const pv = getPeakVaultInstance();
    if (pv) return signBufferViaPeakVault(pv, account, message, authType);
  } else if (extId) {
    const instance =
      extId === 'hive-keeper' ? getHiveKeeperInstance() : getKeychainInstance();
    if (instance)
      return signViaKeychainLike(instance, account, message, authType);
    // Chosen extension is gone (uninstalled); forget the stale preference.
    if (!preferredId) setPreferredExtensionId(account, null);
  }

  const keychainLike = resolveKeychainLikeInstance();
  if (keychainLike)
    return signViaKeychainLike(keychainLike, account, message, authType);
  const pv = getPeakVaultInstance();
  if (pv) return signBufferViaPeakVault(pv, account, message, authType);
  return Promise.reject(new Error(NO_EXTENSION_ERROR));
}

/** Broadcast operations with the account's chosen extension (or best available). */
export function broadcastWithExtension(
  account: string,
  operations: Operation[],
  authType: AuthorityType = 'Posting',
  preferredId?: HiveExtensionId,
): Promise<KeychainResponse> {
  const extId = preferredId ?? getPreferredExtensionId(account);
  if (extId === 'peakvault') {
    const pv = getPeakVaultInstance();
    if (pv) return broadcastViaPeakVault(pv, account, operations, authType);
  } else if (extId) {
    const instance =
      extId === 'hive-keeper' ? getHiveKeeperInstance() : getKeychainInstance();
    if (instance)
      return broadcastViaKeychainLike(instance, account, operations, authType);
    if (!preferredId) setPreferredExtensionId(account, null);
  }

  const keychainLike = resolveKeychainLikeInstance();
  if (keychainLike)
    return broadcastViaKeychainLike(
      keychainLike,
      account,
      operations,
      authType,
    );
  const pv = getPeakVaultInstance();
  if (pv) return broadcastViaPeakVault(pv, account, operations, authType);
  return Promise.reject(new Error(NO_EXTENSION_ERROR));
}

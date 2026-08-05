/**
 * Hosting API authentication.
 *
 * The managed-hosting API only accepts its OWN tokens (issued by /v1/auth/*), never a raw
 * HiveSigner access token. This module exchanges the current session for a hosting token:
 *  - hivesigner: the access token is verified server-side and swapped for a hosting token
 *  - keychain:   a login challenge is signed with the posting key and verified
 *  - hiveauth:   the wallet signs the same challenge; HAS.challenge is separate from
 *                broadcast, so this works even though offline tx signing does not
 *
 * Tokens are cached per-username in localStorage until shortly before expiry.
 */

import { authenticationStore } from '@/store';
import { getHiveAuthSession } from '../storage';
import type { HiveExtensionId } from '../types';
import {
  isHiveAuthSessionValid,
  signChallengeWithHiveAuth,
} from './hive-auth';
import { getExtensionName, signBufferWithExtension } from './hive-extensions';

const STORAGE_KEY = 'ecency_hosting_token';
// Refuse a cached token that expires within a minute so an in-flight save can't outlive it.
const EXPIRY_SLACK_MS = 60 * 1000;

interface StoredToken {
  token: string;
  username: string;
  expiresAt: number;
}

function readCachedToken(username: string): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredToken;
    if (
      stored.username === username &&
      typeof stored.token === 'string' &&
      stored.expiresAt > Date.now() + EXPIRY_SLACK_MS
    ) {
      return stored.token;
    }
  } catch {
    // Fall through to a fresh exchange.
  }
  return null;
}

function cacheToken(stored: StoredToken): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage unavailable (private mode); the token still works for this save.
  }
}

/** Drop the cached hosting token (e.g. after the API rejects it). */
export function clearHostingToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

interface ChallengeResponse {
  challenge: string;
}

interface TokenResponse {
  token: string;
  username: string;
  expiresAt?: string;
}

/** Deadline for hosting API calls so a stalled service fails the save instead of hanging. */
export const HOSTING_FETCH_TIMEOUT_MS = 15_000;

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(HOSTING_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(data?.error || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

/**
 * What to say when an extension signing request comes back empty.
 *
 * `keychain` is the login type for every Hive browser extension, not the
 * Keychain product: the same branch runs for Hive Keeper and Peak Vault, which
 * are what this app offers first. Naming Keychain there sent a Keeper user to
 * check a wallet they never installed.
 *
 * Exported so it can be asserted directly. Nothing in a `.tsx` file is testable
 * under this runner, and the copy for a login method has already drifted from
 * what the code does once.
 */
export function extensionCancelledMessage(
  extension: HiveExtensionId | undefined,
): string {
  return extension
    ? `Signing with ${getExtensionName(extension)} was cancelled.`
    : 'Signing with your browser extension was cancelled.';
}

/**
 * Get a hosting API token for the logged-in user, exchanging the current session for one
 * when there is no valid cached token. Throws with a user-readable message on failure.
 */
export interface HostingTokenCallbacks {
  /**
   * The session is waiting on a wallet the owner has to reach for.
   *
   * Only HiveAuth fires this. Keychain and its siblings pop a dialog over the
   * page the owner is already looking at, so there is nothing to tell them;
   * HiveAuth sends the request to a phone, and without this the panel says
   * "Saving..." while the owner waits for a screen that is not in front of
   * them.
   */
  onWalletWaiting?: () => void;
}

export async function getHostingToken(
  apiBase: string,
  callbacks?: HostingTokenCallbacks,
): Promise<string> {
  const user = authenticationStore.getState().user;
  if (!user) {
    throw new Error('Log in first to save changes.');
  }

  const cached = readCachedToken(user.username);
  if (cached) return cached;

  let result: TokenResponse;

  switch (user.loginType) {
    case 'hivesigner': {
      if (!user.accessToken) {
        throw new Error(
          'Your session has expired. Log in again to save changes.',
        );
      }
      result = await postJson<TokenResponse>(`${apiBase}/v1/auth/hivesigner`, {
        accessToken: user.accessToken,
      });
      break;
    }

    case 'keychain': {
      const challengeResponse = await postJson<ChallengeResponse>(
        `${apiBase}/v1/auth/challenge`,
        { username: user.username },
      );
      const signed = await signBufferWithExtension(
        user.username,
        challengeResponse.challenge,
        'Posting',
        user.extension,
      );
      if (typeof signed.result !== 'string' || signed.result.length === 0) {
        // The wallet that SIGNED, not the one recorded for the session. They
        // differ when the recorded one was uninstalled mid-session and the
        // request fell through to Keeper-first detection, which is exactly the
        // case that would otherwise name a wallet the owner no longer has.
        throw new Error(extensionCancelledMessage(signed.extension));
      }
      result = await postJson<TokenResponse>(`${apiBase}/v1/auth/verify`, {
        username: user.username,
        signature: signed.result,
        challenge: challengeResponse.challenge,
      });
      break;
    }

    case 'hiveauth': {
      // HiveAuth signs a challenge even though it cannot sign a transaction
      // offline, and a challenge is all this exchange ever needed. Worth having
      // beyond parity: it is the only method that both saves config and works
      // on a phone without an extension, since the wallet is the phone.
      const session = getHiveAuthSession();
      if (!isHiveAuthSessionValid(session) || !session) {
        throw new Error(
          'Your HiveAuth session has expired. Log in again to save changes.',
        );
      }

      const challengeResponse = await postJson<ChallengeResponse>(
        `${apiBase}/v1/auth/challenge`,
        { username: user.username },
      );
      const signature = await signChallengeWithHiveAuth(
        session,
        challengeResponse.challenge,
        { onWaiting: callbacks?.onWalletWaiting },
      );
      result = await postJson<TokenResponse>(`${apiBase}/v1/auth/verify`, {
        username: user.username,
        signature,
        challenge: challengeResponse.challenge,
      });
      break;
    }

    default:
      throw new Error(
        'This login method cannot save changes. Log in with a browser extension, HiveSigner or HiveAuth.',
      );
  }

  if (typeof result?.token !== 'string' || result.token.length === 0) {
    throw new Error('Could not authenticate with the hosting service.');
  }

  const expiresAt = result.expiresAt
    ? Date.parse(result.expiresAt)
    : Date.now() + 23 * 60 * 60 * 1000;
  cacheToken({ token: result.token, username: result.username, expiresAt });

  return result.token;
}

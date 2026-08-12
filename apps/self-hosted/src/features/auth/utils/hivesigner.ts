import type { Operation } from '@ecency/sdk';
import {
  HIVESIGNER_CLIENT_ID,
  HIVESIGNER_ME_URL,
  HIVESIGNER_OAUTH_URL,
  HIVESIGNER_SCOPE,
  HIVESIGNER_STATE_KEY,
} from '../constants';

/**
 * Resolve the Hivesigner app this instance should use, or null when it has none.
 *
 * Kept pure and given the configured value rather than reading config itself, so
 * the rule lives in one place and can be tested without the config module.
 *
 * OAuth rejects a redirect_uri the app has not registered, and a hosted blog's
 * origin cannot be registered in advance, so the built-in ecency.app client can
 * never complete a login on a tenant domain. Treated as absent rather than
 * pretending: offering the button sends the visitor to an error with no
 * explanation.
 */
export function resolveHivesignerClientId(configured: unknown): string | null {
  if (typeof configured === 'string' && configured.trim() !== '') {
    return configured.trim();
  }
  return HIVESIGNER_CLIENT_ID === 'ecency.app' ? null : HIVESIGNER_CLIENT_ID;
}

/** A single-use nonce tying a callback back to the login this tab started. */
export function createHivesignerState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const state = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  sessionStorage.setItem(HIVESIGNER_STATE_KEY, state);
  return state;
}

/** True when `state` matches the nonce this tab issued, consuming it either way. */
export function consumeHivesignerState(state: string | null): boolean {
  const expected = sessionStorage.getItem(HIVESIGNER_STATE_KEY);
  sessionStorage.removeItem(HIVESIGNER_STATE_KEY);
  return !!expected && !!state && expected === state;
}

/**
 * Confirm the token really belongs to the claimed account.
 *
 * The callback is URL input: without this a crafted link carrying someone
 * else's valid token logs the visitor in as that account, and everything they
 * then write is attributed to it.
 */
/**
 * Whose token is this, straight from Hivesigner /me, or null when the token
 * is invalid. The handoff path has no claimed identity to check against: the
 * account IS the answer, which is what keeps identity out of URLs entirely.
 */
export async function resolveHivesignerAccount(
  accessToken: string,
): Promise<string | null> {
  try {
    const response = await fetch(HIVESIGNER_ME_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      account?: { name?: string };
      user?: string;
      _id?: string;
    };
    const resolved = body.account?.name || body.user || body._id;
    return typeof resolved === 'string' && resolved.length > 0
      ? resolved.toLowerCase()
      : null;
  } catch {
    return null;
  }
}

export async function verifyHivesignerToken(
  accessToken: string,
  username: string,
): Promise<boolean> {
  try {
    const response = await fetch(HIVESIGNER_ME_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return false;

    const body = (await response.json()) as {
      account?: { name?: string };
      user?: string;
      _id?: string;
    };
    const resolved = body.account?.name || body.user || body._id;
    return (
      typeof resolved === 'string' &&
      resolved.toLowerCase() === username.toLowerCase()
    );
  } catch {
    return false;
  }
}

/**
 * Generate Hivesigner OAuth URL
 */
export function getHivesignerLoginUrl(
  redirectUri: string,
  state: string,
  clientId: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: HIVESIGNER_SCOPE,
  });

  if (state) {
    params.set('state', state);
  }

  return `${HIVESIGNER_OAUTH_URL}?${params.toString()}`;
}

/**
 * Parse Hivesigner callback parameters
 */
export function parseHivesignerCallback(
  search: string,
): { accessToken: string; username: string; expiresIn: number } | null {
  const params = new URLSearchParams(search);

  const accessToken = params.get('access_token');
  const username = params.get('username');
  const expiresIn = params.get('expires_in');

  if (!accessToken || !username) {
    return null;
  }

  return {
    accessToken,
    username,
    expiresIn: expiresIn ? parseInt(expiresIn, 10) : 604800, // Default 7 days
  };
}

/**
 * Broadcast operations with Hivesigner
 */
export async function broadcastWithHivesigner(
  accessToken: string,
  operations: Operation[],
): Promise<unknown> {
  // Dynamic import to avoid bundling hivesigner if not used
  const hs = await import('hivesigner');

  const client = new hs.Client({
    accessToken,
    app: HIVESIGNER_CLIENT_ID,
  });

  return client.broadcast(operations);
}

/**
 * Check if URL contains Hivesigner callback params
 */
export function isHivesignerCallback(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.has('access_token') && params.has('username');
}

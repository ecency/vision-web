// The chat session cookies, shared by the API routes and the websocket route.

export const MATTERMOST_TOKEN_COOKIE = "mm_pat";
// The Ecency account the chat session cookie was issued to (#2023).
export const MATTERMOST_OWNER_COOKIE = "mm_owner";
// Set by the client for the account active in the browser (ACTIVE_USER_COOKIE_NAME).
const ACTIVE_USER_COOKIE = "active_user";

function decodeCookie(value: string | undefined): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value).trim().toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

/**
 * The chat session token from the cookies, or null when there is none for
 * the account active in the browser. The session cookie is not tied to the
 * Ecency login, so after a logout or account switch whose expiry request
 * failed (or a late Set-Cookie from another tab re-set it) it would answer as
 * the previous account (#2023). It counts only while its owner cookie names
 * the account in the `active_user` cookie. A session without an owner (set
 * before the owner cookie existed) does not count here; see
 * `ownerlessMattermostSession`.
 */
export function mattermostCookieToken(
  readCookie: (name: string) => string | undefined
): string | null {
  const token = readCookie(MATTERMOST_TOKEN_COOKIE);
  if (!token) return null;
  const owner = decodeCookie(readCookie(MATTERMOST_OWNER_COOKIE));
  const active = decodeCookie(readCookie(ACTIVE_USER_COOKIE));
  if (!owner || owner !== active) return null;
  return token;
}

/**
 * A chat session cookie set before the owner cookie existed: the token and
 * the account active in the browser, or null when the session names an owner
 * or there is no token or no active account. The caller checks whom the token
 * belongs to before honouring it, so the badge keeps working after the deploy
 * on pages that never run the bootstrap.
 */
export function ownerlessMattermostSession(
  readCookie: (name: string) => string | undefined
): { token: string; active: string } | null {
  const token = readCookie(MATTERMOST_TOKEN_COOKIE);
  if (!token || decodeCookie(readCookie(MATTERMOST_OWNER_COOKIE))) return null;
  const active = decodeCookie(readCookie(ACTIVE_USER_COOKIE));
  return active ? { token, active } : null;
}

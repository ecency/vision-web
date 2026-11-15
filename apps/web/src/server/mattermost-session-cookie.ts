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
 * before the owner cookie existed) does not count: the client bootstraps
 * again on the 401.
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

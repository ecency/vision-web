import * as ls from "./local-storage";
import { User } from "@/entities";
import { decodeObj, encodeObj } from "@/utils/encoder";
import { hsTokenRenew } from "@ecency/sdk";

const logMissingUser = () => {
  if (process.env.NODE_ENV !== "production") {
    console.debug("User does not exist!");
  }
};

export const getUser = (
  username: string,
  setActiveUser?: (value: null) => void
): User | undefined => {
  const raw = ls.get(`user_${username}`);
  if (!raw) {
    logMissingUser();
    setActiveUser?.(null);
    return undefined;
  }

  try {
    return decodeObj(raw) as User;
  } catch (e) {
    // A corrupted record can't be recovered by decoding the plain username (that
    // is not an encoded object and throws again, escaping getUser). Treat it as a
    // missing user instead.
    logMissingUser();
    setActiveUser?.(null);
    return undefined;
  }
};

// Refresh buffer: refresh 5 minutes before actual expiry
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

// Prevent concurrent refresh requests for the same user
const pendingRefreshes = new Map<string, Promise<string | undefined>>();

function isTokenExpired(user: User): boolean {
  if (!user.tokenObtainedAt || !user.expiresIn) {
    // No timestamp stored (legacy session) — assume expired to trigger refresh
    return true;
  }
  const expiresAtMs = user.tokenObtainedAt + user.expiresIn * 1000;
  return Date.now() >= expiresAtMs - REFRESH_BUFFER_MS;
}

function updateUserInStorage(user: User): void {
  ls.set(`user_${user.username}`, encodeObj(user));
}

/**
 * Refreshes the token in the background (fire-and-forget).
 * Updates localStorage when done so the next getAccessToken() call returns the fresh token.
 */
function refreshTokenInBackground(user: User): void {
  if (!user.refreshToken || pendingRefreshes.has(user.username)) return;

  const refreshPromise = hsTokenRenew(user.refreshToken)
    .then((refreshed) => {
      const updatedUser: User = {
        ...user,
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresIn: refreshed.expires_in,
        tokenObtainedAt: Date.now()
      };
      updateUserInStorage(updatedUser);
      return refreshed.access_token;
    })
    .catch((err) => {
      console.error("Background token refresh failed:", err);
      // Not the token captured at the start: undefined, as ensureValidToken's
      // own failed refresh gives. ensureValidTokenWithin then re-reads
      // storage, where another tab may have stored a fresh token.
      return undefined;
    })
    .finally(() => {
      pendingRefreshes.delete(user.username);
    });

  pendingRefreshes.set(user.username, refreshPromise);
}

/**
 * Returns the current access token from localStorage.
 * If the token is expired, triggers a background refresh so the next call gets a fresh token.
 * Use ensureValidToken() when you need a guaranteed-valid token before making a request.
 */
export const getAccessToken = (username: string): string | undefined => {
  const user = getUser(username);
  if (!user) return undefined;

  // If token is expired, trigger background refresh
  if (isTokenExpired(user)) {
    refreshTokenInBackground(user);
  }

  return user.accessToken;
};

export const getPostingKey = (username: string): null | undefined | string => {
  const user = getUser(username);
  return user?.postingKey;
};

export const getLoginType = (username: string): null | undefined | string => {
  const user = getUser(username);
  return user?.loginType;
};

export const getRefreshToken = (username: string): string | undefined => {
  const user = getUser(username);
  return user?.refreshToken;
};

/**
 * Returns a valid access token, refreshing it automatically if expired.
 * Awaits the refresh before returning — use this for critical operations
 * like draft saving, scheduling, and any mutation that must not fail due to expired tokens.
 */
export async function ensureValidToken(username: string): Promise<string | undefined> {
  const user = getUser(username);
  if (!user) return undefined;

  // If token isn't expired, return it directly
  if (!isTokenExpired(user)) {
    return user.accessToken;
  }

  // No refresh token available — return current token as-is
  if (!user.refreshToken) {
    return user.accessToken;
  }

  // Deduplicate concurrent refreshes for the same user
  const existing = pendingRefreshes.get(username);
  if (existing) {
    return existing;
  }

  const refreshPromise = (async () => {
    try {
      const refreshed = await hsTokenRenew(user.refreshToken);

      const updatedUser: User = {
        ...user,
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresIn: refreshed.expires_in,
        tokenObtainedAt: Date.now()
      };
      updateUserInStorage(updatedUser);

      return refreshed.access_token;
    } catch (err) {
      console.error("Token refresh failed:", err);
      return undefined;
    } finally {
      pendingRefreshes.delete(username);
    }
  })();

  pendingRefreshes.set(username, refreshPromise);
  return refreshPromise;
}

/**
 * ensureValidToken with a time limit: a renewal that stalls (HiveSigner slow
 * or down) must not hold up the request that needs the token. Past `ms`, or
 * when renewing fails, the stored token as it is, read without starting
 * another renewal (getAccessToken would); undefined only with no stored
 * token. A renewal still running finishes in the background and stores its
 * token for the next call.
 */
export function ensureValidTokenWithin(username: string, ms = 5000): Promise<string | undefined> {
  const cached = () => getUser(username)?.accessToken;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(cached()), ms);
    ensureValidToken(username).then(
      (token) => {
        clearTimeout(timer);
        resolve(token ?? cached());
      },
      () => {
        clearTimeout(timer);
        resolve(cached());
      }
    );
  });
}

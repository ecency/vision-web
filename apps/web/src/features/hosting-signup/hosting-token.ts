import { getLoginType, ensureValidToken } from "@/utils/user-token";
import { signBuffer } from "@/utils/keychain";
import { hostingApi, type HostingAuthResult } from "./hosting-api";

/**
 * A hosting-API token for the signed-in account, obtained in place so the
 * manage panel can call the tenant PATCH endpoint without a visit to the
 * instance.
 *
 * Two rails, tried in order:
 * - Every ecency.com login method holds a Hivesigner-compatible access token,
 *   so exchanging it (/v1/auth/hivesigner) is the universal path.
 * - A Keychain login can also sign the challenge (/v1/auth/challenge +
 *   /v1/auth/verify) when the exchange is unavailable.
 *
 * Tokens are cached per account for their lifetime (the API issues 24h), so
 * a session edits many settings on one authorization.
 */

const cache = new Map<string, { token: string; expiresAt: number }>();

/** Test seam: module memory otherwise leaks between cases. */
export function resetHostingTokenCache(): void {
  cache.clear();
}

function remember(result: HostingAuthResult): string {
  const expiresAt = result.expiresAt
    ? Date.parse(result.expiresAt)
    : Date.now() + 23 * 60 * 60 * 1000;
  cache.set(result.username, { token: result.token, expiresAt });
  return result.token;
}

export async function obtainHostingToken(username: string): Promise<string> {
  const hit = cache.get(username);
  // A minute of slack: a token that expires mid-request helps nobody.
  if (hit && hit.expiresAt - 60_000 > Date.now()) {
    return hit.token;
  }
  cache.delete(username);

  // The universal rail first. ensureValidToken refreshes a stale stored
  // token before it is exchanged, so a long-lived login works too.
  let exchangeError: Error | null = null;
  try {
    const accessToken = await ensureValidToken(username);
    if (accessToken) {
      return remember(await hostingApi.authHivesigner(accessToken));
    }
  } catch (e) {
    exchangeError = e as Error;
  }

  // Keychain can prove the account by signing the challenge directly.
  if (getLoginType(username) === "keychain") {
    const { challenge } = await hostingApi.authChallenge(username);
    const signed = await signBuffer(username, challenge, "Posting");
    if (!signed.success || !signed.result) {
      throw new Error(signed.message || "Signature refused");
    }
    return remember(await hostingApi.authVerify(username, signed.result, challenge));
  }

  throw exchangeError ?? new Error("No session token available");
}

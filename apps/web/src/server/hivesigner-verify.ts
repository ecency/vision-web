/**
 * Shared HiveSigner access token verification.
 *
 * Both the Mattermost bootstrap and 3Speak proxy routes authenticate users
 * by validating a HiveSigner OAuth access token against
 * `https://hivesigner.com/api/me`. This module centralizes that logic.
 */

import { EcencyConfigManager } from "@/config";
import { decodeToken } from "@/utils/hs-token";

export type HsVerifyResult =
  | { ok: true; username: string }
  | { ok: false; reason: "invalid" | "unavailable" };

// An access token lives 7 days and the client renews it near expiry; a day's
// grace covers a session picked up after a few idle days. HiveSigner itself
// enforces no expiry, so this is the only age limit. The date is under the
// token's signature: only HiveSigner or the account's own key holder can set
// it. A small allowance for clock skew the other way.
const TOKEN_MAX_AGE_S = 8 * 24 * 60 * 60;
const TOKEN_MAX_SKEW_S = 300;

export async function verifyHsAccessToken(
  token: string,
  signal?: AbortSignal
): Promise<HsVerifyResult> {
  // HiveSigner's /api/me accepts any valid token, whatever app it was issued
  // to and whatever kind (a code, a refresh token). Identity for this app
  // comes only from an access token issued to this app, for one account.
  const message = decodeToken(token);
  const author = message?.authors?.[0];
  if (
    message?.signed_message?.type !== "posting" ||
    message.signed_message.app !== EcencyConfigManager.CONFIG.service.hsClientId ||
    !Array.isArray(message.authors) ||
    message.authors.length !== 1 ||
    typeof author !== "string"
  ) {
    return { ok: false, reason: "invalid" };
  }
  const age = Date.now() / 1000 - message.timestamp;
  if (typeof message.timestamp !== "number" || !(age <= TOKEN_MAX_AGE_S && age >= -TOKEN_MAX_SKEW_S)) {
    return { ok: false, reason: "invalid" };
  }

  const timeoutSignal = AbortSignal.timeout(8_000);
  const mergedSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  let res: Response;
  try {
    res = await fetch("https://hivesigner.com/api/me", {
      headers: { Authorization: `Bearer ${token}` },
      signal: mergedSignal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      console.error("[HiveSigner] /api/me timed out");
    } else if (!signal?.aborted) {
      console.error("[HiveSigner] /api/me network error", e);
    }
    return { ok: false, reason: "unavailable" };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: "invalid" };
  }
  if (!res.ok) {
    console.error(`[HiveSigner] /api/me upstream error ${res.status}`);
    return { ok: false, reason: "unavailable" };
  }

  try {
    const data = await res.json();
    const username = data?.account?.name ?? data?.user;
    if (typeof username !== "string" || username !== author) {
      return { ok: false, reason: "invalid" };
    }
    return { ok: true, username };
  } catch (e) {
    console.error("[HiveSigner] /api/me parse error", e);
    return { ok: false, reason: "unavailable" };
  }
}

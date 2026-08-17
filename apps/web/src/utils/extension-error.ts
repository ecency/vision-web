import type { TxResponse } from "@/types";
import i18next from "i18next";

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

/**
 * Normalizes an extension `error` field to a lowercased string for matching.
 * Extensions return `error` either as a string code or as an object
 * (e.g. `{ code: 4001, message: "User rejected request" }`), so we pull the
 * common message-bearing fields before falling back to a serialized form.
 */
function normalizeErrorText(error: unknown): string {
  if (error == null) return "";
  if (typeof error === "string") return error.toLowerCase();
  if (typeof error === "object") {
    const e = error as Record<string, unknown>;
    const fields = [e.message, e.error, e.reason, e.type]
      .filter((v): v is string => typeof v === "string")
      .join(" ");
    return (fields || safeStringify(error)).toLowerCase();
  }
  return String(error).toLowerCase();
}

/**
 * Builds a meaningful error message from a Keychain-style failure response.
 *
 * Keychain-compatible extensions return the human-readable reason in `message`
 * and the underlying node/RPC error in `error` (a string code or an object).
 * We surface both so the user sees the real cause, and so the SDK's error
 * classifier (`parseChainError` / `shouldTriggerAuthFallback`) can detect cases
 * like a missing active authority and trigger the auth-upgrade flow instead of
 * hard-failing on a generic, unmatchable string.
 *
 * A user cancellation is the exception: there is no underlying cause worth
 * surfacing, so joining the parts only leaked an internal code to the user
 * ("Request was canceled by the user. -- user_cancel"). Those resolve to a single
 * translated sentence instead. Nothing classifies on the cancellation text:
 * `parseChainError` has no cancellation branch, `shouldTriggerAuthFallback` fires
 * only on missing-authority/token-expired, so this cannot re-trigger an auth
 * upgrade. The retry gates read `isUserCancellation(resp)` off the response
 * itself, never off the message.
 */
export function extensionErrorMessage(
  resp: Pick<TxResponse, "message" | "error">,
  fallback: string
): string {
  if (isUserCancellation(resp)) {
    return i18next.t("trx-common.cancelled");
  }

  const parts: string[] = [];
  if (resp.message) {
    parts.push(String(resp.message));
  }
  if (resp.error != null) {
    const detail =
      typeof resp.error === "string" ? resp.error : safeStringify(resp.error);
    if (detail && detail !== "{}" && !parts.includes(detail)) {
      parts.push(detail);
    }
  }
  return parts.join(" — ") || fallback;
}

/**
 * True when a Keychain-style failure represents the user declining/cancelling
 * the request (rather than a node, network, or validation error). Used to avoid
 * pointless broadcast retries that would re-open the extension popup. Handles
 * both string and object-shaped `error` fields (e.g. `{ code: 4001, message:
 * "User rejected request" }`).
 */
export function isUserCancellation(
  resp: Pick<TxResponse, "message" | "error">
): boolean {
  const haystack = `${normalizeErrorText(resp.error)} ${(resp.message ?? "").toLowerCase()}`;
  return (
    haystack.includes("cancel") || // user_cancel, cancelled, canceled
    haystack.includes("declined") ||
    haystack.includes("reject") // "User rejected request" (code 4001)
  );
}

/**
 * True when a failure looks like a node/transport/connectivity problem, so
 * retrying the broadcast through a different RPC node could plausibly succeed.
 * Deterministic chain errors (missing authority, insufficient RC, invalid op,
 * already broadcasted) fail identically on any node, so they return false —
 * retrying them would only re-open the extension popup for no benefit. With no
 * usable signal at all we return false rather than blindly re-prompting.
 */
export function isRetryableNodeError(
  resp: Pick<TxResponse, "message" | "error">
): boolean {
  const text = `${normalizeErrorText(resp.error)} ${(resp.message ?? "").toLowerCase()}`.trim();
  if (!text) return false;
  return [
    "timeout",
    "timed out",
    "etimedout",
    "connection refused",
    "econnrefused",
    "enotfound",
    "eai_again",
    "econnreset",
    "socket hang up",
    "network error", // axios ERR_NETWORK
    "networkerror", // browser "NetworkError when attempting to fetch"
    "failed to fetch",
    "fetch failed",
    "bad gateway",
    "gateway timeout",
    "service unavailable",
    "temporarily unavailable",
    "origin servers are unavailable",
    "could not connect",
    "unable to connect",
    // gateway/upstream statuses only — NOT 500, which can wrap deterministic
    // chain rejections (missing authority, RC) that fail identically on retry.
    "status code 502",
    "status code 503",
    "status code 504",
  ].some((sig) => text.includes(sig));
}

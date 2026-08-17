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
 * translated sentence instead. Replacing the text discards the real cause, so the
 * test is `isExplicitUserCancellation` (wallet cancellation codes and user-driven
 * phrases only), NOT the deliberately loose `isUserCancellation` used by the retry
 * gate: "transaction rejected: missing required active authority" has to keep its
 * authority detail or the SDK's auth-upgrade classifier never sees it.
 *
 * The retry gates read the response object, never this message, so a translated
 * cancellation cannot change retry or auth-fallback behaviour.
 */
export function extensionErrorMessage(
  resp: Pick<TxResponse, "message" | "error">,
  fallback: string
): string {
  if (isExplicitUserCancellation(resp)) {
    return i18next.t("external-transfer.cancelled");
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
 * A failure signal that rules a cancellation out however cancel-ish the rest of
 * the text reads. A node that answers "transaction rejected: missing required
 * active authority" is reporting a cause the user (and the SDK's auth-upgrade
 * classifier) must keep seeing.
 */
const CHAIN_FAILURE_SIGNAL =
  /missing (required )?(active|owner|posting) authority|resource credit|insufficient|unauthorized|token expired/;

/** An `error` field that is nothing but a user-named cancellation code, e.g. "user_cancel". */
const EXPLICIT_CANCELLATION_CODE = /^user[_-]?(cancel(l?ed)?|reject(ed)?|denied|declined)$/;

/**
 * A status that names no actor: "rejected" alone reads as a user cancellation,
 * but the same word is what a node says when it refuses a transaction, so it
 * only counts while the response carries no other detail.
 */
const BARE_CANCELLATION_STATUS = /^(cancel(l?ed)?|reject(ed)?|denied|declined)$/;

/** Phrases only a user-driven cancellation produces, anchored on the actor. */
const CANCELLATION_PHRASES = [
  /\buser[_ ]?cancel(l?ed)?\b/, // "user_cancel", "the user cancelled the request"
  /\buser (rejected|denied|declined)\b/, // "User rejected request" (code 4001)
  /\b(cancell?ed|rejected|denied|declined) by (the )?user\b/ // Keychain's own wording
];

/** EIP-1193 / wallet standard code for "user rejected the request". */
const USER_REJECTED_CODE = 4001;

/**
 * True when a failure is explicitly a user cancellation.
 *
 * Deliberately narrower than `isUserCancellation`: this one decides whether to
 * REPLACE the error text, where a false positive hides a real cause. It matches
 * only a user-named cancellation code, the wallet `4001` code, or a phrase that
 * names the user as the actor. A bare "reject"/"cancel" substring is not enough,
 * so `limit_order_cancel` in an assert message or a node's "transaction rejected"
 * keeps its detail.
 *
 * A bare status code ("rejected", "cancelled") names no actor, so it only counts
 * while the response carries nothing else: `{ error: "rejected", message: "Invalid
 * transaction: duplicate transaction" }` is a node refusal whose message is the
 * only thing telling the user what went wrong.
 */
export function isExplicitUserCancellation(
  resp: Pick<TxResponse, "message" | "error">
): boolean {
  const haystack = `${normalizeErrorText(resp.error)} ${(resp.message ?? "").toLowerCase()}`;
  if (CHAIN_FAILURE_SIGNAL.test(haystack)) {
    return false;
  }

  if (
    typeof resp.error === "object" &&
    resp.error !== null &&
    (resp.error as { code?: unknown }).code === USER_REJECTED_CODE
  ) {
    return true;
  }

  const code = typeof resp.error === "string" ? resp.error.trim().toLowerCase() : "";
  if (EXPLICIT_CANCELLATION_CODE.test(code)) {
    return true;
  }

  if (CANCELLATION_PHRASES.some((phrase) => phrase.test(haystack))) {
    return true;
  }

  return BARE_CANCELLATION_STATUS.test(code) && (resp.message ?? "").trim().length === 0;
}

/**
 * True when a Keychain-style failure looks like the user declining/cancelling
 * the request (rather than a node, network, or validation error). Used to avoid
 * pointless broadcast retries that would re-open the extension popup. Handles
 * both string and object-shaped `error` fields (e.g. `{ code: 4001, message:
 * "User rejected request" }`).
 *
 * Loose on purpose, and only safe because of what it gates: over-matching here
 * costs one skipped retry, never a hidden error. Use `isExplicitUserCancellation`
 * for anything that replaces or suppresses the underlying failure.
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

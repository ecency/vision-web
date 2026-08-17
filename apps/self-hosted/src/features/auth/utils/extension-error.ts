import { type TranslationKey, translations } from '@/core/i18n-strings';

/**
 * Turning an extension failure into something worth showing a user.
 *
 * Ported from the web client (apps/web/src/utils/extension-error.ts), where a
 * cancelled signing request rendered as "Request was canceled by the user. --
 * user_cancel": Keychain's internal code, straight on screen. Here it was worse,
 * the throw sites used `resp.error` alone, so a cancel showed the bare
 * `user_cancel` with no readable half at all.
 */

interface ExtensionFailure {
  message?: string;
  error?: unknown;
}

/**
 * `core/i18n`'s `t()` reaches `configuration-loader`, which statically imports the
 * gitignored build-time `config.json`. Importing it here would make this module,
 * and every test that touches the signing path, unloadable in CI. The language is
 * already on the document (`applyConfigDom` writes `configuration.general.language`
 * to `<html lang>`), so read it from there and look the string up directly.
 */
function translate(key: TranslationKey): string {
  const language =
    typeof document !== 'undefined' ? document.documentElement.lang : '';
  return translations[language]?.[key] ?? translations.en[key];
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

/**
 * Normalizes an extension `error` field to a lowercased string for matching.
 * Extensions return it either as a string code or as an object (e.g.
 * `{ code: 4001, message: "User rejected request" }`).
 */
function normalizeErrorText(error: unknown): string {
  if (error == null) return '';
  if (typeof error === 'string') return error.toLowerCase();
  if (typeof error === 'object') {
    const e = error as Record<string, unknown>;
    const fields = [e.message, e.error, e.reason, e.type]
      .filter((v): v is string => typeof v === 'string')
      .join(' ');
    return (fields || safeStringify(error)).toLowerCase();
  }
  return String(error).toLowerCase();
}

/**
 * A failure signal that rules a cancellation out however cancel-ish the rest of
 * the text reads. A node answering "transaction rejected: missing required active
 * authority" is reporting a cause the user has to keep seeing.
 */
const CHAIN_FAILURE_SIGNAL =
  /missing (required )?(active|owner|posting) authority|resource credit|insufficient|unauthorized|token expired/;

/** An `error` field that is nothing but a user-named cancellation code. */
const EXPLICIT_CANCELLATION_CODE =
  /^user[_-]?(cancel(l?ed)?|reject(ed)?|denied|declined)$/;

/**
 * A status that names no actor: "rejected" alone reads as a user cancellation,
 * but the same word is what a node says when it refuses a transaction, so it only
 * counts while the response carries no other detail.
 */
const BARE_CANCELLATION_STATUS =
  /^(cancel(l?ed)?|reject(ed)?|denied|declined)$/;

/** Phrases only a user-driven cancellation produces, anchored on the actor. */
const CANCELLATION_PHRASES = [
  /\buser[_ ]?cancel(l?ed)?\b/,
  /\buser (rejected|denied|declined)\b/,
  /\b(cancell?ed|rejected|denied|declined) by (the )?user\b/,
];

/** EIP-1193 / wallet standard code for "user rejected the request". */
const USER_REJECTED_CODE = 4001;

/**
 * True when a failure is explicitly a user cancellation.
 *
 * Narrow on purpose: it decides whether the real failure text is discarded, so a
 * false positive would hide the cause. A bare "cancel"/"reject" substring is not
 * enough, which keeps `limit_order_cancel` inside an assert message and a node's
 * "transaction rejected" intact.
 */
export function isExplicitUserCancellation(resp: ExtensionFailure): boolean {
  const haystack = `${normalizeErrorText(resp.error)} ${(resp.message ?? '').toLowerCase()}`;
  if (CHAIN_FAILURE_SIGNAL.test(haystack)) {
    return false;
  }

  if (
    typeof resp.error === 'object' &&
    resp.error !== null &&
    (resp.error as { code?: unknown }).code === USER_REJECTED_CODE
  ) {
    return true;
  }

  const code =
    typeof resp.error === 'string' ? resp.error.trim().toLowerCase() : '';
  if (EXPLICIT_CANCELLATION_CODE.test(code)) {
    return true;
  }

  if (CANCELLATION_PHRASES.some((phrase) => phrase.test(haystack))) {
    return true;
  }

  return (
    BARE_CANCELLATION_STATUS.test(code) &&
    (resp.message ?? '').trim().length === 0
  );
}

/**
 * Builds a message worth showing from an extension failure.
 *
 * A cancellation resolves to one translated sentence, since there is no
 * underlying cause worth surfacing. Everything else keeps both halves the
 * extension gave us: the readable reason and the underlying node/RPC error.
 */
export function extensionErrorMessage(
  resp: ExtensionFailure,
  fallback: string,
): string {
  if (isExplicitUserCancellation(resp)) {
    return translate('transaction_cancelled_by_user');
  }

  const parts: string[] = [];
  if (resp.message) {
    parts.push(String(resp.message));
  }
  if (resp.error != null) {
    const detail =
      typeof resp.error === 'string' ? resp.error : safeStringify(resp.error);
    if (detail && detail !== '{}' && !parts.includes(detail)) {
      parts.push(detail);
    }
  }
  return parts.join(' - ') || fallback;
}

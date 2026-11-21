/**
 * 3Speak daily upload limits for free (non-Pro) accounts.
 *
 * Over the limit, `POST {embed}/uploads/token` (and a TUS create) answers
 * 429 with `code: "daily_upload_limit"`, the `kind` ("video" or "short"), the
 * `limit`, the `next_at` time a slot frees up, an English `message` and an
 * `upgrade_url`. `GET {embed}/uploads/quota?owner=` reports the allowance
 * up front so the upload dialog can warn before a file is picked.
 *
 * Pure parsing only: the server route and the browser client both import it.
 */

export const THREESPEAK_UPLOAD_LIMIT_CODE = "daily_upload_limit";

export type ThreeSpeakUploadKind = "video" | "short";

export interface ThreeSpeakUploadLimit {
  code: typeof THREESPEAK_UPLOAD_LIMIT_CODE;
  /** null when the server did not say which kind was refused. */
  kind: ThreeSpeakUploadKind | null;
  limit: number | null;
  used: number | null;
  /** ISO 8601 time the next upload slot frees up. */
  nextAt: string | null;
  retryAfterSeconds: number | null;
  /** Plain English message from 3Speak, the fallback text. */
  message: string | null;
  /** https link on a 3Speak host, or null. */
  upgradeUrl: string | null;
}

export interface ThreeSpeakKindQuota {
  /** null = unlimited (exempt, or limits disabled). */
  limit: number | null;
  used: number;
  remaining: number | null;
  nextAt: string | null;
}

export interface ThreeSpeakUploadQuota {
  enabled: boolean;
  exempt: boolean;
  video: ThreeSpeakKindQuota | null;
  short: ThreeSpeakKindQuota | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function finiteOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 64) return null;
  return Number.isNaN(Date.parse(v)) ? null : v;
}

function kindOrNull(v: unknown): ThreeSpeakUploadKind | null {
  return v === "video" || v === "short" ? v : null;
}

/**
 * Only an https link on 3speak.tv (or a subdomain) is rendered as the upgrade
 * button, so a tampered response cannot point the button somewhere else.
 */
export function sanitizeThreeSpeakUpgradeUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 2048) return null;
  try {
    const url = new URL(v);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return null;
    if (host !== "3speak.tv" && !host.endsWith(".3speak.tv")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** The daily limit refusal in a 3Speak error body, or null when it is some other error. */
export function parseThreeSpeakUploadLimit(body: unknown): ThreeSpeakUploadLimit | null {
  if (!isRecord(body) || body.code !== THREESPEAK_UPLOAD_LIMIT_CODE) return null;
  const message =
    typeof body.message === "string" && body.message.trim() ? body.message.slice(0, 500) : null;
  return {
    code: THREESPEAK_UPLOAD_LIMIT_CODE,
    kind: kindOrNull(body.kind),
    limit: finiteOrNull(body.limit),
    used: finiteOrNull(body.used),
    nextAt: isoOrNull(body.next_at),
    retryAfterSeconds: finiteOrNull(body.retry_after_seconds),
    message,
    upgradeUrl: sanitizeThreeSpeakUpgradeUrl(body.upgrade_url)
  };
}

/** Same as parseThreeSpeakUploadLimit, from a raw response text. */
export function parseThreeSpeakUploadLimitText(text: string | null | undefined) {
  if (!text) return null;
  try {
    return parseThreeSpeakUploadLimit(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * The refusal in the snake_case shape 3Speak sends, for the proxy route to
 * hand on to web and mobile clients. Only known fields pass.
 */
export function toThreeSpeakUploadLimitBody(limit: ThreeSpeakUploadLimit) {
  return {
    error: "Daily upload limit reached",
    code: limit.code,
    kind: limit.kind,
    limit: limit.limit,
    used: limit.used,
    next_at: limit.nextAt,
    retry_after_seconds: limit.retryAfterSeconds,
    message: limit.message,
    upgrade_url: limit.upgradeUrl
  };
}

function parseKindQuota(v: unknown): ThreeSpeakKindQuota | null {
  if (!isRecord(v)) return null;
  return {
    limit: finiteOrNull(v.limit),
    used: finiteOrNull(v.used) ?? 0,
    remaining: finiteOrNull(v.remaining),
    nextAt: isoOrNull(v.next_at)
  };
}

/** A `GET /uploads/quota` body, or null when it is not one. */
export function parseThreeSpeakUploadQuota(body: unknown): ThreeSpeakUploadQuota | null {
  if (!isRecord(body) || typeof body.enabled !== "boolean") return null;
  return {
    enabled: body.enabled,
    exempt: body.exempt === true,
    video: parseKindQuota(body.video),
    short: parseKindQuota(body.short)
  };
}

/**
 * The refusal the next upload of `kind` would get, judged from the quota, or
 * null when an upload may go ahead or nothing is known. The server stays the
 * source of truth: this only drives the notice shown before a file is picked.
 */
export function quotaToThreeSpeakUploadLimit(
  quota: ThreeSpeakUploadQuota | null | undefined,
  kind: ThreeSpeakUploadKind
): ThreeSpeakUploadLimit | null {
  if (!quota || !quota.enabled || quota.exempt) return null;
  const k = quota[kind];
  if (!k || k.remaining !== 0) return null;
  return {
    code: THREESPEAK_UPLOAD_LIMIT_CODE,
    kind,
    limit: k.limit,
    used: k.used,
    nextAt: k.nextAt,
    retryAfterSeconds: null,
    message: null,
    upgradeUrl: null
  };
}

/** Thrown by the upload client when 3Speak refuses an upload over the daily limit. */
export class ThreeSpeakUploadLimitError extends Error {
  readonly status = 429;
  readonly limit: ThreeSpeakUploadLimit;

  constructor(limit: ThreeSpeakUploadLimit) {
    super(limit.message ?? "[3Speak Embed] Daily upload limit reached");
    this.name = "ThreeSpeakUploadLimitError";
    this.limit = limit;
  }
}

export function isThreeSpeakUploadLimitError(e: unknown): e is ThreeSpeakUploadLimitError {
  return e instanceof ThreeSpeakUploadLimitError;
}

/**
 * The part of tus-js-client's `DetailedError` that a refused TUS create
 * carries. Its `HttpResponse` fits this shape, so a tus error passes as is.
 */
export interface TusRefusalError extends Error {
  originalResponse?: {
    getStatus(): number;
    getBody(): string | null | undefined;
  } | null;
}

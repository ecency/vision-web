import { isResourceCreditsError } from "@ecency/sdk";
import { formatError } from "@/api/format-error";
import { ErrorTypes } from "@/enums";
import { sentry } from "@/core/sentry/lazy-sentry";

/**
 * Out-of-RC telemetry (#2196): one Sentry `info` message per event, grouped
 * under a fixed fingerprint so it never pages as an error. Sentry then gives
 * daily events and unique users per stage and op. The mobile app sends the
 * identical shape; keep the two in step.
 */
export type RcShortfallOp = "post" | "comment" | "vote" | "reblog" | "transfer" | "other";
type RcShortfallStage = "rejected" | "precheck";

// Rejections already reported, by error object. A failure can pass through
// more than one handler (mutation, then caller); it is counted once.
const reportedErrors = new WeakSet<object>();
// Pre-check warnings already reported, as "day:username:op". Kept in memory
// too, so a browser that refuses storage still reports once per page load.
const reportedPrechecks = new Set<string>();
// Persists the same keys for the current UTC day across reloads and tabs, so
// pre-check events approximate unique users per op per day.
const PRECHECK_STORAGE_KEY = "ecency_rc_precheck_reported";

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function readStoredPrechecks(day: string): string[] {
  try {
    const raw = window.localStorage.getItem(PRECHECK_STORAGE_KEY);
    const stored = raw ? JSON.parse(raw) : null;
    return stored?.day === day && Array.isArray(stored.keys) ? stored.keys : [];
  } catch {
    return [];
  }
}

function writeStoredPrechecks(day: string, keys: string[]) {
  try {
    window.localStorage.setItem(PRECHECK_STORAGE_KEY, JSON.stringify({ day, keys }));
  } catch {
    // The in-memory set still covers this page load.
  }
}

/** Same RC classification as the SDK (and so the mobile app) plus the web toast's own. */
function isRcRejection(err: unknown): boolean {
  return (
    isResourceCreditsError(err) ||
    formatError(err)[1] === ErrorTypes.INSUFFICIENT_RESOURCE_CREDITS
  );
}

function send(stage: RcShortfallStage, op: RcShortfallOp, username: string | undefined) {
  sentry.captureMessage("rc-shortfall", {
    level: "info",
    fingerprint: ["rc-shortfall"],
    tags: { "rc.stage": stage, "rc.op": op },
    ...(username ? { user: { username } } : {})
  });
}

/**
 * Reports a broadcast rejected for insufficient RC. Anything else is ignored,
 * so a call site can pass every error it catches. Never throws.
 */
export function reportRcRejection(err: unknown, op: RcShortfallOp, username: string | undefined) {
  try {
    if (!isRcRejection(err)) {
      return;
    }
    if (typeof err === "object" && err !== null) {
      if (reportedErrors.has(err)) {
        return;
      }
      reportedErrors.add(err);
    }
    send("rejected", op, username);
  } catch {
    // Telemetry must never break the broadcast flow.
  }
}

/**
 * Reports that the RC pre-check warned, at most once per account and op per
 * UTC day on this browser. Never throws.
 */
export function reportRcPrecheck(username: string | undefined, op: RcShortfallOp) {
  try {
    if (!username) {
      return;
    }
    const day = utcDay();
    const key = `${username}:${op}`;
    if (reportedPrechecks.has(`${day}:${key}`)) {
      return;
    }
    reportedPrechecks.add(`${day}:${key}`);
    const stored = readStoredPrechecks(day);
    if (stored.includes(key)) {
      return;
    }
    writeStoredPrechecks(day, [...stored, key]);
    send("precheck", op, username);
  } catch {
    // Telemetry must never break rendering.
  }
}

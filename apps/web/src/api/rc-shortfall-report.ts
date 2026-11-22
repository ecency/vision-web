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
// Accounts whose pre-check warning was already reported in this page session.
const reportedPrechecks = new Set<string>();

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
    if (formatError(err)[1] !== ErrorTypes.INSUFFICIENT_RESOURCE_CREDITS) {
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

/** Reports that the RC pre-check warned, at most once per account per page session. Never throws. */
export function reportRcPrecheck(username: string | undefined, op: RcShortfallOp) {
  try {
    if (!username || reportedPrechecks.has(username)) {
      return;
    }
    reportedPrechecks.add(username);
    send("precheck", op, username);
  } catch {
    // Telemetry must never break rendering.
  }
}

import { formatError } from "@/api/format-error";
import { ErrorTypes } from "@/enums";

/**
 * A publish attempt that failed because the account was out of RC.
 *
 * The username is captured at failure time rather than read from the active
 * account at render time. Accounts can be switched from the navbar while this
 * alert is on screen, and a top-up button that silently retargets to whichever
 * account happens to be active would boost the wrong one.
 */
export interface RcShortfall {
  message: string;
  username: string;
}

/**
 * Returns a shortfall when the error is an out-of-RC rejection, otherwise null.
 *
 * This is the piece that was broken: the publish page called formatError and
 * destructured only the message, so the RC classification never reached the UI
 * and the top-up affordance never appeared.
 */
export function resolveRcShortfall(err: unknown, username: string | undefined): RcShortfall | null {
  if (!username) {
    return null;
  }

  const [message, errorType] = formatError(err);
  if (errorType !== ErrorTypes.INSUFFICIENT_RESOURCE_CREDITS) {
    return null;
  }

  return { message, username };
}

/** Top-up destination for a specific account. */
export function buildRcTopUpUrl(username: string): string {
  return `/purchase?username=${encodeURIComponent(username)}&type=boost&product_id=999points`;
}

/**
 * Whether a shortfall raised for one account should still be shown while
 * another is active. It should not: the failure belongs to the account that
 * hit it, and leaving it up invites topping up the wrong one.
 */
export function isShortfallStillRelevant(
  shortfall: RcShortfall | null,
  activeUsername: string | undefined
): boolean {
  return !!shortfall && shortfall.username === activeUsername;
}

/**
 * Subscription standing, and what a tenant is still entitled to once it lapses.
 *
 * `expireSubscriptions` flips subscription_status to 'expired' and deliberately does NOT touch
 * subscription_plan, so a tenant that stopped paying kept plan = 'pro' forever. Every custom
 * domain gate read the plan alone, which meant a lapsed customer could still attach a new domain
 * and still verify it, occupying that domain against the global UNIQUE constraint and adding it
 * to the first-party CORS allowlist.
 *
 * Status is the single source of truth for capability; the plan says what was bought, not
 * whether it is currently paid for. The plan is deliberately left alone on expiry:
 * hosting/origin/sync-custom-domains.py selects on `subscription_plan = 'pro'` to decide which
 * hosts get a vhost and a certificate, so downgrading the plan would pull the certificate of a
 * customer who is a few days late and take their site offline. That is worse than the bug.
 *
 * Between expiry and the end of the grace window the tenant keeps everything, so a renewal (or a
 * re-verification during one) is never blocked by being briefly late. After it, capabilities are
 * refused but nothing is unbound: the binding survives, and paying brings it straight back.
 */

import type { Tenant } from '../types';

/** Fail safe to the default for any value that is not a positive integer. */
export function parseGraceDays(raw: string | undefined, fallback: number): number {
  const trimmed = (raw ?? '').trim();
  const n = /^\d+$/.test(trimmed) ? parseInt(trimmed, 10) : NaN;
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export const DEFAULT_PRO_GRACE_DAYS = 14;

/**
 * Days after subscription_expires_at during which a lapsed tenant keeps its Pro capabilities.
 * Long enough to cover a renewal that is being sorted out, short enough that a domain is not
 * held indefinitely by an account that stopped paying.
 */
export const PRO_GRACE_DAYS = parseGraceDays(process.env.PRO_GRACE_DAYS, DEFAULT_PRO_GRACE_DAYS);

/**
 * Days an unpaid (inactive) reservation holds its name before the sweep
 * reclaims it. One resolver, so the sweep and every user-facing surface
 * (payment step, manage panel) quote the same number. Fail-safe 7: a
 * zero/negative/NaN value would sweep every inactive reservation at once.
 */
export function reservationGraceDays(): number {
  return parseGraceDays(process.env.ABANDONED_TENANT_GRACE_DAYS, 7);
}

export type CapabilityState =
  /** Paid and current. */
  | 'active'
  /** Lapsed, still inside the grace window: everything keeps working. */
  | 'grace'
  /** Lapsed past the grace window (or suspended, or never activated): capabilities refused. */
  | 'lapsed'
  /** The plan does not include custom domains at all. */
  | 'none';

export interface CustomDomainCapability {
  state: CapabilityState;
  /** Whether a custom domain may be attached or verified right now. */
  allowed: boolean;
  /** End of the grace window, when the tenant is inside one. */
  graceEndsAt: Date | null;
}

type StandingFields = Pick<
  Tenant,
  'subscriptionPlan' | 'subscriptionStatus' | 'subscriptionExpiresAt'
>;

/**
 * Whether a tenant may attach or verify a custom domain, and why not when it may not.
 *
 * Fails closed: a status this does not recognise, or an 'expired' row with no expiry date to
 * measure a grace window from, is treated as lapsed rather than allowed.
 */
export function customDomainCapability(
  tenant: StandingFields,
  now: Date = new Date(),
  graceDays: number = PRO_GRACE_DAYS
): CustomDomainCapability {
  if (tenant.subscriptionPlan !== 'pro') {
    return { state: 'none', allowed: false, graceEndsAt: null };
  }
  if (tenant.subscriptionStatus === 'active') {
    return { state: 'active', allowed: true, graceEndsAt: null };
  }
  // Only an expiry lapse gets grace. 'suspended' is an operator decision, and
  // 'inactive'/'abandoned' were never paid for, so none of them earn one.
  if (tenant.subscriptionStatus === 'expired' && tenant.subscriptionExpiresAt) {
    const graceEndsAt = new Date(
      new Date(tenant.subscriptionExpiresAt).getTime() + graceDays * 24 * 60 * 60 * 1000
    );
    if (now <= graceEndsAt) {
      return { state: 'grace', allowed: true, graceEndsAt };
    }
    return { state: 'lapsed', allowed: false, graceEndsAt };
  }
  return { state: 'lapsed', allowed: false, graceEndsAt: null };
}

/**
 * SQL predicate for the same rule, for queries that select tenants in good standing. $1 is the
 * grace window in days. Kept next to the function above so the two cannot drift apart.
 */
export const IN_GOOD_STANDING_SQL = `(
  subscription_status = 'active'
  OR (
    subscription_status = 'expired'
    AND subscription_expires_at IS NOT NULL
    AND subscription_expires_at > NOW() - ($1 * INTERVAL '1 day')
  )
)`;

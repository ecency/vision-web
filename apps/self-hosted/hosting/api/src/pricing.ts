/**
 * Single source of truth for hosting payment amounts and the payment account.
 *
 * Every route that QUOTES a price to a user (payments/instructions, tenants create, the x402
 * paywalls, payments/methods) and the payment-listener that VALIDATES the paid transfer must agree
 * on the same numbers. When they diverged (some files defaulted MONTHLY_PRICE_HBD to 0.100, others
 * to 2.000) a user could follow a quoted amount and be credited a different number of months, or
 * have a correct payment rejected. Keeping the defaults here — read once — makes that impossible.
 *
 * Defaults match production env.
 */

export const PAYMENT_ACCOUNT = process.env.PAYMENT_ACCOUNT || 'ecency.hosting';

export const MONTHLY_PRICE_HBD = parseFloat(process.env.MONTHLY_PRICE_HBD || '2.000');

// Custom-domain ('pro') tier: standard + 1 HBD/mo unless explicitly overridden.
export const CUSTOM_DOMAIN_MONTHLY_PRICE_HBD = parseFloat(
  process.env.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD || (MONTHLY_PRICE_HBD + 1).toString()
);

// The monthly premium of the custom-domain tier over standard hosting — i.e. the per-month cost of
// adding a custom domain to an already-paid standard blog. Used to PRORATE a mid-term upgrade so
// the owner pays exactly the difference for the months remaining on their current term.
export const CUSTOM_DOMAIN_UPGRADE_DELTA_HBD = Math.max(
  0,
  CUSTOM_DOMAIN_MONTHLY_PRICE_HBD - MONTHLY_PRICE_HBD
);

// Whole months remaining on a subscription, rounding a partial month UP (so an active tenant with
// any remaining term pays for at least one month of the add-on). Returns 0 for a null/past expiry.
//
// Counted from the time left, in average-length months, so the count can only go DOWN as time
// passes: the quote and the listener each use their own "now", and a payment made exactly as
// quoted must never meet a higher amount later. Stepping calendar months from "now" was not
// monotonic (an expiry of Mar 3 counted 1 month at Jan 31 23:59 and 2 at Feb 1 00:00).
//
// The 3-day slack absorbs calendar months shorter or longer than the average, including the
// setMonth() rollover the activation paths use to build an expiry (a month bought on Jan 31 ends
// on Mar 3), so a freshly bought N-month term always counts as N. The cost is that a partial
// month of 3 days or less is not charged.
const AVERAGE_MONTH_MS = (365.2425 / 12) * 24 * 60 * 60 * 1000;
const MONTH_SLACK_MS = 3 * 24 * 60 * 60 * 1000;

export function remainingMonths(expiresAt: Date | null, now: Date): number {
  if (!expiresAt) return 0;
  const left = expiresAt.getTime() - now.getTime();
  if (left <= 0) return 0;
  return Math.max(1, Math.ceil((left - MONTH_SLACK_MS) / AVERAGE_MONTH_MS));
}

// Prorated HBD cost to add a custom domain to an active tenant for the rest of its current term.
export function customDomainUpgradeHbd(expiresAt: Date | null, now: Date): number {
  return remainingMonths(expiresAt, now) * CUSTOM_DOMAIN_UPGRADE_DELTA_HBD;
}

/**
 * What a custom-domain payment buys, on every rail (HBD transfer, card). `months` is what the
 * memo or card product asked for; the caller has already checked the amount covers that many
 * months at the custom-domain rate on its own.
 *
 * A standard blog with time left first pays the premium for those months (moving the running
 * term to the custom-domain plan); what is left buys months at the custom-domain rate, at most
 * `months`. A payment that cannot cover the premium plus one month, for instance because another
 * payment extended the term after the quote, keeps the blog standard and buys standard months
 * with the whole amount. A paid transfer is never refused and never credited nothing.
 */
export function creditCustomDomainPayment(
  paid: number,
  months: number,
  tenant: { plan: string; status: string; expiresAt: Date | null } | null,
  now: Date
): { pro: boolean; months: number } {
  if (!tenant || tenant.plan === 'pro' || tenant.status !== 'active') return { pro: true, months };
  const paidMillis = Math.round(paid * 1000);
  const premiumMillis = Math.round(customDomainUpgradeHbd(tenant.expiresAt, now) * 1000);
  const affordable = Math.floor((paidMillis - premiumMillis) / Math.round(CUSTOM_DOMAIN_MONTHLY_PRICE_HBD * 1000));
  if (affordable >= 1) return { pro: true, months: Math.min(months, affordable) };
  return { pro: false, months: Math.floor(paidMillis / Math.round(MONTHLY_PRICE_HBD * 1000)) };
}

// HBD amounts are conventionally quoted to 3 decimals (e.g. "2.000 HBD").
export const hbd = (n: number): string => n.toFixed(3);

import { loadStripe, Stripe } from "@stripe/stripe-js";

// Tier catalog + isStripeEnabled live in a dependency-free module so consumers that
// only need tier data don't pull in @stripe/stripe-js (its main entry injects the
// js.stripe.com script on import). Re-exported here for existing import sites.
export {
  DEFAULT_STRIPE_TIER_SKU,
  STRIPE_POINTS_TIERS,
  isKnownTierSku,
  isStripeEnabled,
  skuUsdCents,
  suggestPointsSkuForDeficit,
  type StripePointsTier
} from "./stripe-tiers";

import { isStripeEnabled } from "./stripe-tiers";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

let stripePromise: Promise<Stripe | null> | undefined;

/**
 * Memoised Stripe.js loader (loadStripe must run once per page). Returns undefined
 * when the publishable key is not configured so callers can fall back gracefully.
 */
export const getStripePromise = (): Promise<Stripe | null> | undefined => {
  if (!isStripeEnabled()) {
    return undefined;
  }
  if (!stripePromise) {
    stripePromise = loadStripe(PUBLISHABLE_KEY);
  }
  return stripePromise;
};

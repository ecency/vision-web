// Dependency-free tier catalog + helpers. Kept separate from stripe-config.ts so
// consumers that only need tier data (e.g. the top-up CTA rendered across the app)
// do NOT pull in @stripe/stripe-js, whose main entry injects the js.stripe.com
// script as a module-eval side effect.

// The publishable key is public (safe in the browser) but environment-specific
// (test vs live), baked at build time as a NEXT_PUBLIC_ var. When unset, card
// payment is disabled and the entry points hide themselves.
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

export const isStripeEnabled = (): boolean => PUBLISHABLE_KEY.trim().length > 0;

export interface StripePointsTier {
  /** SKU forwarded to ePoints; the amount + Points are derived there server-side. */
  sku: string;
  /** USD price (the SKU's leading number IS the price in cents). */
  usd: number;
  /** Points delivered. MUST mirror ePoints STRIPE_PRODUCT_MAP (server is the truth). */
  points: number;
}

// Mirrors ePoints constants.py STRIPE_PRODUCT_MAP. The smallest IAP tiers (099/199)
// are intentionally not offered on the card rail. Kept sorted ascending by points;
// suggestPointsSkuForDeficit relies on that order.
//
// The Points figures drive the display label AND the deficit->tier suggestion, so
// keep them in sync with the server map: a drift no longer only mislabels a tile,
// it can preselect a tier that fails to cover the user's deficit.
export const STRIPE_POINTS_TIERS: StripePointsTier[] = [
  { sku: "499points", usd: 4.99, points: 2800 },
  { sku: "999points", usd: 9.99, points: 6000 },
  { sku: "4999points", usd: 49.99, points: 31500 },
  { sku: "9999points", usd: 99.99, points: 70000 }
];

export const DEFAULT_STRIPE_TIER_SKU = "999points";

/**
 * USD price in cents derived from the SKU's leading number. Every SKU on the ePoints
 * card rail encodes its price this way (499points, 1999pro, 200hosting, 3600prohosting),
 * mirroring the server product map. Returns 0 for a malformed SKU; callers treat 0 as
 * unconfigured and refuse to render a checkout for it.
 */
export function skuUsdCents(sku: string): number {
  const cents = parseInt(sku, 10);
  return Number.isFinite(cents) && cents > 0 ? cents : 0;
}

/** Whether a sku string is one of the known card-rail tiers. */
export const isKnownTierSku = (sku: string): boolean =>
  STRIPE_POINTS_TIERS.some((tier) => tier.sku === sku);

/**
 * Smallest card tier whose Points cover the deficit; largest tier when even that
 * falls short. Undefined when there is no deficit to cover.
 */
export function suggestPointsSkuForDeficit(deficit: number): string | undefined {
  if (!Number.isFinite(deficit) || deficit <= 0) {
    return undefined;
  }
  return (
    STRIPE_POINTS_TIERS.find((tier) => tier.points >= deficit) ??
    STRIPE_POINTS_TIERS[STRIPE_POINTS_TIERS.length - 1]
  ).sku;
}

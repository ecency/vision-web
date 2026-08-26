import {
  HOSTING_CUSTOM_DOMAIN_MONTHLY_USD,
  HOSTING_MONTHLY_USD,
  hostingProSkuForMonths,
  hostingSkuForMonths
} from "@/features/hosting-signup/hosting-api";
import { PRO_PRICE_USD, PRO_SKU } from "@/features/pro/pro-config";
import {
  DEFAULT_STRIPE_TIER_SKU,
  skuUsdCents,
  STRIPE_POINTS_TIERS
} from "@/features/shared/purchase-stripe/stripe-config";
import { describe, expect, it } from "vitest";

describe("stripe-config", () => {
  it("offers exactly the four card tiers (smallest IAP tiers excluded)", () => {
    expect(STRIPE_POINTS_TIERS.map((t) => t.sku)).toEqual([
      "499points",
      "999points",
      "4999points",
      "9999points"
    ]);
  });

  it("mirrors the ePoints STRIPE_PRODUCT_MAP price + points per tier", () => {
    // Must match ePoints constants.py STRIPE_PRODUCT_MAP (server is the source of truth).
    expect(STRIPE_POINTS_TIERS).toEqual([
      { sku: "499points", usd: 4.99, points: 2800 },
      { sku: "999points", usd: 9.99, points: 6000 },
      { sku: "4999points", usd: 49.99, points: 31500 },
      { sku: "9999points", usd: 99.99, points: 70000 }
    ]);
  });

  it("derives the USD price from the SKU number (cents)", () => {
    STRIPE_POINTS_TIERS.forEach((t) => {
      const cents = parseInt(t.sku, 10);
      expect(Math.round(t.usd * 100)).toBe(cents);
    });
  });

  it("uses a default tier that exists in the catalog", () => {
    expect(STRIPE_POINTS_TIERS.some((t) => t.sku === DEFAULT_STRIPE_TIER_SKU)).toBe(true);
  });
});

// The deferred Elements render prices from skuUsdCents BEFORE any intent exists, so this
// derivation must stay in lockstep with the server product map on every rail: a drift
// would show one price on the Payment Element and charge another.
describe("skuUsdCents", () => {
  it("matches the USD price in cents for every Points tier", () => {
    STRIPE_POINTS_TIERS.forEach((t) => {
      expect(skuUsdCents(t.sku)).toBe(Math.round(t.usd * 100));
    });
  });

  it("matches the Pro price for the Pro SKU", () => {
    expect(skuUsdCents(PRO_SKU)).toBe(Math.round(PRO_PRICE_USD * 100));
  });

  it("prices every hosting term from the SKU leading number", () => {
    [1, 3, 6, 12].forEach((months) => {
      const standard = hostingSkuForMonths(months);
      expect(standard.endsWith("hosting")).toBe(true);
      expect(skuUsdCents(standard)).toBe(HOSTING_MONTHLY_USD * 100 * months);

      const custom = hostingProSkuForMonths(months);
      expect(custom.endsWith("prohosting")).toBe(true);
      expect(skuUsdCents(custom)).toBe(HOSTING_CUSTOM_DOMAIN_MONTHLY_USD * 100 * months);
    });
  });

  it("returns 0 (unconfigured) for a SKU without a leading number", () => {
    expect(skuUsdCents("")).toBe(0);
    expect(skuUsdCents("points")).toBe(0);
    expect(skuUsdCents("garbage")).toBe(0);
    expect(skuUsdCents("-499points")).toBe(0);
  });
});

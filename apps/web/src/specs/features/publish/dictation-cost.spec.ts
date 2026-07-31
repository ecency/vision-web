import { describe, expect, test } from "vitest";
import { estimateDictationCost } from "@/app/publish/_hooks/estimate-dictation-cost";

/**
 * This figure is shown to the user before they spend Points, so it has to match the
 * server's arithmetic exactly. A mismatch is not a cosmetic bug: it either promises a
 * price that is not honoured, or scares people off a clip that would have been cheap.
 */
describe("estimateDictationCost", () => {
  const pricing = { unitSeconds: 30, unitCost: 15, freeRemaining: 0 };

  test("rounds up to a whole unit", () => {
    // A 31s clip costs the same as a 60s one. Rounding down here would under-quote
    // every clip that is not an exact multiple.
    expect(estimateDictationCost(1, pricing)).toBe(15);
    expect(estimateDictationCost(29, pricing)).toBe(15);
    expect(estimateDictationCost(30, pricing)).toBe(15);
    expect(estimateDictationCost(31, pricing)).toBe(30);
    expect(estimateDictationCost(60, pricing)).toBe(30);
    expect(estimateDictationCost(300, pricing)).toBe(150);
  });

  test("a clip shorter than one unit still costs one", () => {
    // The vendor bills a minimum per request, so a zero-length clip is not free.
    expect(estimateDictationCost(0, pricing)).toBe(15);
  });

  test("the free allowance discounts units, not whole clips", () => {
    // The distinction that matters: one free UNIT off a 90s clip leaves two billable
    // units. One free REQUEST would have made the whole clip free.
    const withFree = { ...pricing, freeRemaining: 1 };
    expect(estimateDictationCost(30, withFree)).toBe(0);
    expect(estimateDictationCost(90, withFree)).toBe(30);
  });

  test("never goes negative when the allowance exceeds the clip", () => {
    const generous = { ...pricing, freeRemaining: 10 };
    expect(estimateDictationCost(30, generous)).toBe(0);
  });

  test("follows server-supplied pricing rather than hardcoding it", () => {
    // The dialog reads these off the price endpoint, so a pricing change on the
    // server must not require a client release.
    expect(estimateDictationCost(60, { unitSeconds: 15, unitCost: 5, freeRemaining: 0 })).toBe(20);
  });
});

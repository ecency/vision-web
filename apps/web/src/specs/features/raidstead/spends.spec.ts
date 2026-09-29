import { afterEach, describe, expect, it, vi } from "vitest";
import { pendingSpendKey, settleSpend } from "@/features/raidstead/spends";

describe("pending spend keys", () => {
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("keeps an unanswered key across hours and the day's reset", () => {
    vi.useFakeTimers({ now: new Date("2026-10-21T23:30:00Z") });
    const key = pendingSpendKey("ann", "chest", 1);
    vi.setSystemTime(new Date("2026-10-22T03:00:00Z"));
    expect(pendingSpendKey("ann", "chest", 1)).toBe(key);
  });

  it("takes a new key once the server answered", () => {
    const key = pendingSpendKey("ann", "chest", 1);
    settleSpend("ann", "chest");
    expect(pendingSpendKey("ann", "chest", 1)).not.toBe(key);
  });

  it("keeps keys apart per account and kind, and drops an earlier season's", () => {
    const chest = pendingSpendKey("ann", "chest", 1);
    expect(pendingSpendKey("ann", "rally", 1)).not.toBe(chest);
    expect(pendingSpendKey("bob", "chest", 1)).not.toBe(chest);
    expect(pendingSpendKey("ann", "chest", 2)).not.toBe(chest);
  });
});

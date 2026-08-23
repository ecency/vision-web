import { describe, expect, it } from "vitest";
import dayjs from "@/utils/dayjs";
import { getHbdSavingsInterestState } from "@/utils/hbd-savings-interest";

/**
 * The estimate mirrors the chain's own savings interest accounting, so the
 * fixtures below are real account rows read from condenser_api.get_accounts.
 */
const NOW = dayjs("2026-08-23T06:00:00.000Z");
// hbd_interest_rate is in basis points; 1000 is the 10% APR in force.
const RATE = 1000;

const state = (input: Partial<Parameters<typeof getHbdSavingsInterestState>[0]>) =>
  getHbdSavingsInterestState({ hbdInterestRate: RATE, now: NOW, ...input });

describe("getHbdSavingsInterestState estimate", () => {
  it("adds the seconds accrued since the last update to the banked ones", () => {
    // @good-karma: nothing banked, 1.099 HBD sitting in savings since April.
    const result = state({
      savingsHbdBalance: "1.099 HBD",
      savingsHbdSeconds: 0,
      savingsHbdSecondsLastUpdate: "2026-04-13T13:27:30",
      savingsHbdLastInterestPayment: "2026-04-13T13:27:30"
    });

    // The chain truncates twice, so it pays 0.039 where a float estimate
    // would round the same state up to 0.040.
    expect(result.pendingInterest).toBe(0.039);
    expect(result.hasPendingInterest).toBe(true);
    expect(result.hasSavingsBalance).toBe(true);
    expect(result.canClaim).toBe(true);
  });

  it("counts interest banked before the balance was emptied", () => {
    // @ecency: savings drained, but the chain has not settled the seconds yet.
    const result = state({
      savingsHbdBalance: "0.000 HBD",
      savingsHbdSeconds: 23901200496,
      savingsHbdSecondsLastUpdate: "2026-03-31T20:33:15",
      savingsHbdLastInterestPayment: "2026-03-26T10:41:39"
    });

    expect(result.pendingInterest).toBe(0.075);
    expect(result.hasPendingInterest).toBe(true);
    expect(result.hasSavingsBalance).toBe(false);
    expect(result.isEmpty).toBe(false);
  });

  it("reads savings_hbd_seconds sent as a string", () => {
    const asNumber = state({
      savingsHbdBalance: "0.000 HBD",
      savingsHbdSeconds: 23901200496,
      savingsHbdSecondsLastUpdate: "2026-03-31T20:33:15"
    });
    const asString = state({
      savingsHbdBalance: "0.000 HBD",
      savingsHbdSeconds: "23901200496",
      savingsHbdSecondsLastUpdate: "2026-03-31T20:33:15"
    });

    expect(asString.pendingInterest).toBe(asNumber.pendingInterest);
  });

  it("is zero while the chain reports no interest rate", () => {
    const result = state({
      savingsHbdBalance: "1000.000 HBD",
      savingsHbdSeconds: 0,
      savingsHbdSecondsLastUpdate: "2026-01-01T00:00:00",
      hbdInterestRate: 0
    });

    expect(result.pendingInterest).toBe(0);
    expect(result.hasPendingInterest).toBe(false);
  });

  it("treats an epoch timestamp as no history rather than 56 years of accrual", () => {
    const result = state({
      savingsHbdBalance: "10.000 HBD",
      savingsHbdSeconds: 0,
      savingsHbdSecondsLastUpdate: "1970-01-01T00:00:00",
      savingsHbdLastInterestPayment: "1970-01-01T00:00:00"
    });

    expect(result.pendingInterest).toBe(0);
    expect(result.nextClaimDate).toBeNull();
    expect(result.canClaim).toBe(false);
  });
});

describe("getHbdSavingsInterestState visibility", () => {
  it("is empty only when nothing is saved and nothing has accrued", () => {
    expect(
      state({
        savingsHbdBalance: "0.000 HBD",
        savingsHbdSeconds: 0,
        savingsHbdSecondsLastUpdate: "2026-08-23T05:00:00"
      }).isEmpty
    ).toBe(true);
  });

  it("stays visible on a drained balance that still holds interest", () => {
    // Regression: the card was hidden on savings balance alone, which took the
    // estimate with it and left the accrued interest invisible.
    expect(
      state({
        savingsHbdBalance: "0.000 HBD",
        savingsHbdSeconds: 23901200496,
        savingsHbdSecondsLastUpdate: "2026-03-31T20:33:15",
        savingsHbdLastInterestPayment: "2026-03-26T10:41:39"
      }).isEmpty
    ).toBe(false);
  });

  it("stays visible on a fresh deposit that has not accrued anything yet", () => {
    const result = state({
      savingsHbdBalance: "50.000 HBD",
      savingsHbdSeconds: 0,
      savingsHbdSecondsLastUpdate: "2026-08-23T05:59:30",
      savingsHbdLastInterestPayment: "2026-08-23T05:59:30"
    });

    expect(result.isEmpty).toBe(false);
    expect(result.hasPendingInterest).toBe(false);
    expect(result.canClaim).toBe(false);
  });
});

describe("getHbdSavingsInterestState claim eligibility", () => {
  const banked = {
    savingsHbdBalance: "100.000 HBD",
    savingsHbdSeconds: 0
  };

  it("is not claimable before the 30 day interval has elapsed", () => {
    const result = state({
      ...banked,
      savingsHbdSecondsLastUpdate: "2026-08-10T00:00:00",
      savingsHbdLastInterestPayment: "2026-08-10T00:00:00"
    });

    expect(result.hasPendingInterest).toBe(true);
    expect(result.isClaimDue).toBe(false);
    expect(result.canClaim).toBe(false);
    expect(result.nextClaimDate?.toISOString()).toBe("2026-09-09T00:00:00.000Z");
  });

  it("becomes claimable once the interval has passed", () => {
    const result = state({
      ...banked,
      savingsHbdSecondsLastUpdate: "2026-07-01T00:00:00",
      savingsHbdLastInterestPayment: "2026-07-01T00:00:00"
    });

    expect(result.isClaimDue).toBe(true);
    expect(result.canClaim).toBe(true);
    expect(result.needsDepositToClaim).toBe(false);
  });

  it("measures the interval from the last payment, not the last balance change", () => {
    // The chain compares against savings_hbd_last_interest_payment, so a later
    // deposit does not push the claim date out.
    const result = state({
      ...banked,
      savingsHbdSecondsLastUpdate: "2026-08-20T00:00:00",
      savingsHbdLastInterestPayment: "2026-07-01T00:00:00"
    });

    expect(result.nextClaimDate?.toISOString()).toBe("2026-07-31T00:00:00.000Z");
    expect(result.canClaim).toBe(true);
  });

  it("cannot claim a drained balance, because the trigger transfer needs 0.001 HBD", () => {
    const result = state({
      savingsHbdBalance: "0.000 HBD",
      savingsHbdSeconds: 23901200496,
      savingsHbdSecondsLastUpdate: "2026-03-31T20:33:15",
      savingsHbdLastInterestPayment: "2026-03-26T10:41:39"
    });

    expect(result.isClaimDue).toBe(true);
    expect(result.needsDepositToClaim).toBe(true);
    expect(result.canClaim).toBe(false);
  });

  it("does not claim an estimate the chain would round away", () => {
    // 0.0009 HBD of interest: below the three decimals HBD is stored with.
    const result = state({
      savingsHbdBalance: "1.000 HBD",
      savingsHbdSeconds: 0,
      savingsHbdSecondsLastUpdate: "2026-08-22T18:00:00",
      savingsHbdLastInterestPayment: "2026-01-01T00:00:00"
    });

    expect(result.pendingInterest).toBeLessThan(0.001);
    expect(result.hasPendingInterest).toBe(false);
    expect(result.isClaimDue).toBe(true);
    expect(result.canClaim).toBe(false);
  });
});

describe("getHbdSavingsInterestState malformed input", () => {
  it("does not produce NaN from a missing account", () => {
    const result = getHbdSavingsInterestState({ hbdInterestRate: RATE, now: NOW });

    expect(result.savingsBalance).toBe(0);
    expect(result.pendingInterest).toBe(0);
    expect(result.isEmpty).toBe(true);
  });

  it("does not produce NaN from unparseable fields", () => {
    const result = state({
      savingsHbdBalance: "not-an-asset",
      savingsHbdSeconds: "not-a-number",
      savingsHbdSecondsLastUpdate: "not-a-date"
    });

    expect(Number.isFinite(result.savingsBalance)).toBe(true);
    expect(Number.isFinite(result.pendingInterest)).toBe(true);
    expect(result.isEmpty).toBe(true);
  });
});

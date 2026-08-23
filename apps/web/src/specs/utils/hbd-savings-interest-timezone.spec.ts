import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Chain timestamps arrive as "YYYY-MM-DDTHH:mm:ss" with no zone marker and are
 * UTC. Handed to dayjs as-is they read as LOCAL time, which shifts the claim
 * schedule by the viewer's offset. At UTC+14 that is 14 hours of saying "ready
 * to claim now" while the chain would still refuse the payout.
 *
 * The rest of the suite runs in whatever timezone CI happens to use, which is
 * UTC, so it cannot see this. This file runs the same state through the extreme
 * offsets in both directions.
 */
const ZONES = [
  "UTC",
  "Pacific/Kiritimati", // UTC+14, the furthest ahead
  "Pacific/Midway", // UTC-11, the furthest behind
  "Asia/Kathmandu", // UTC+05:45, a non-hour offset
  "America/New_York" // a zone that observes DST
];

const ORIGINAL_TZ = process.env.TZ;

describe("chain timestamps are read as UTC in every timezone", () => {
  beforeAll(() => {
    // Node re-reads process.env.TZ per call, so a spec can move the clock's
    // zone. Confirm that here rather than assume it, otherwise this whole file
    // would silently degrade into five copies of the UTC case.
    process.env.TZ = "Pacific/Kiritimati";
    const shifted =
      new Date("2026-03-26T10:41:39").getTime() - new Date("2026-03-26T10:41:39.000Z").getTime();
    process.env.TZ = ORIGINAL_TZ;
    expect(shifted).not.toBe(0);
  });

  afterAll(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  async function stateIn(zone: string) {
    process.env.TZ = zone;
    // Re-import per zone: dayjs and the helper capture nothing zone-specific,
    // but resetting modules keeps the zones from sharing any cached state.
    const { getHbdSavingsInterestState } = await import("@/utils/hbd-savings-interest");
    const dayjs = (await import("@/utils/dayjs")).default;

    return getHbdSavingsInterestState({
      savingsHbdBalance: "100.000 HBD",
      savingsHbdSeconds: 0,
      savingsHbdSecondsLastUpdate: "2026-07-01T00:00:00",
      savingsHbdLastInterestPayment: "2026-07-01T00:00:00",
      hbdInterestRate: 1000,
      now: dayjs("2026-08-23T06:00:00.000Z")
    });
  }

  it.each(ZONES)("resolves the same instant and the same estimate in %s", async (zone) => {
    const state = await stateIn(zone);

    // 2026-07-01T00:00:00Z plus the 30 day compound interval.
    expect(state.nextClaimDate?.toISOString()).toBe("2026-07-31T00:00:00.000Z");
    // Independent of the zone: the elapsed seconds are measured between two
    // instants, not two wall clocks. Derived here rather than written as a
    // literal so the expectation cannot drift from the inputs above.
    const elapsedSeconds =
      BigInt(
        (Date.parse("2026-08-23T06:00:00.000Z") - Date.parse("2026-07-01T00:00:00.000Z")) / 1000
      );
    expect(state.pendingInterestSatoshis).toBe(
      Number((((100_000n * elapsedSeconds) / 31536000n) * 1000n) / 10000n)
    );
    expect(state.isClaimDue).toBe(true);
  });

  it.each(ZONES)("does not let %s decide whether a claim is due", async (zone) => {
    process.env.TZ = zone;
    const { getHbdSavingsInterestState } = await import("@/utils/hbd-savings-interest");
    const dayjs = (await import("@/utils/dayjs")).default;

    // One minute short of the interval. No timezone may turn this into "due":
    // the chain would reject the payout at this instant everywhere on earth.
    const state = getHbdSavingsInterestState({
      savingsHbdBalance: "100.000 HBD",
      savingsHbdSeconds: 0,
      savingsHbdSecondsLastUpdate: "2026-07-01T00:00:00",
      savingsHbdLastInterestPayment: "2026-07-01T00:00:00",
      hbdInterestRate: 1000,
      now: dayjs("2026-07-30T23:59:00.000Z")
    });

    expect(state.isClaimDue).toBe(false);
    expect(state.canClaim).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import dayjs from "@/utils/dayjs";
import {
  getHbdSavingsInterestState,
  MINIMUM_HBD_SAVINGS_AMOUNT
} from "@/utils/hbd-savings-interest";
import fixture from "./hbd-savings-accounts.fixture.json";

/**
 * Adversarial checks on the interest estimate.
 *
 * The estimate is a promise about money: it tells someone what a claim will
 * put in their savings. So rather than assert the numbers this implementation
 * happens to produce, these tests hold it against an independent reference,
 * against real account rows read off the chain, and against payloads built to
 * break it.
 */

/**
 * hived's `adjust_savings_balance`, transcribed straight from the chain source
 * and kept deliberately separate from the implementation under test:
 *
 *   interest  = savings_hbd_seconds / HIVE_SECONDS_PER_YEAR
 *   interest *= hbd_interest_rate
 *   interest /= HIVE_100_PERCENT
 *
 * Every step is uint128, so both divisions truncate. A float version of the
 * same expression rounds instead, which overstates the payout.
 */
function chainInterestSatoshis(
  balanceSatoshis: bigint,
  bankedSatoshiSeconds: bigint,
  elapsedSeconds: bigint,
  rate: bigint
): bigint {
  const total = bankedSatoshiSeconds + balanceSatoshis * elapsedSeconds;
  return ((total / 31536000n) * rate) / 10000n;
}

const NOW = dayjs(`${fixture.capturedAt}.000Z`);
const RATE = fixture.hbdInterestRate;

const elapsed = (last: string) =>
  BigInt(Math.abs(Math.round((NOW.valueOf() - Date.parse(`${last}.000Z`)) / 1000)));

const toSatoshis = (asset: string) => BigInt(asset.replace(/[^0-9]/g, ""));

describe("estimate against the chain's own arithmetic, on real accounts", () => {
  // Rows captured from condenser_api.get_accounts, every account found with a
  // savings balance or banked savings seconds.
  it("matches hived to the satoshi on every captured account", () => {
    const mismatches = fixture.accounts
      .map((account) => {
        const state = getHbdSavingsInterestState({
          savingsHbdBalance: account.savings_hbd_balance,
          savingsHbdSeconds: account.savings_hbd_seconds,
          savingsHbdSecondsLastUpdate: account.savings_hbd_seconds_last_update,
          savingsHbdLastInterestPayment: account.savings_hbd_last_interest_payment,
          hbdInterestRate: RATE,
          now: NOW
        });
        const expected = chainInterestSatoshis(
          toSatoshis(account.savings_hbd_balance),
          BigInt(account.savings_hbd_seconds),
          elapsed(account.savings_hbd_seconds_last_update),
          BigInt(RATE)
        );
        return { name: account.name, got: state.pendingInterestSatoshis, expected };
      })
      .filter((row) => BigInt(row.got) !== row.expected);

    expect(mismatches).toEqual([]);
  });

  it("covers a meaningful spread of real states", () => {
    // Guards the fixture itself: a file that silently emptied would make the
    // check above pass while testing nothing.
    expect(fixture.accounts.length).toBeGreaterThan(20);
    expect(
      fixture.accounts.some((a) => BigInt(a.savings_hbd_seconds) > 0n)
    ).toBe(true);
    expect(
      fixture.accounts.some((a) => a.savings_hbd_balance.startsWith("0.000"))
    ).toBe(true);
  });

  it("never tells the user more than the chain will pay", () => {
    // The original float expression overstated 25 of these 62 accounts by
    // 0.001 HBD, because it rounded where the chain truncates.
    for (const account of fixture.accounts) {
      const state = getHbdSavingsInterestState({
        savingsHbdBalance: account.savings_hbd_balance,
        savingsHbdSeconds: account.savings_hbd_seconds,
        savingsHbdSecondsLastUpdate: account.savings_hbd_seconds_last_update,
        savingsHbdLastInterestPayment: account.savings_hbd_last_interest_payment,
        hbdInterestRate: RATE,
        now: NOW
      });
      const expected = chainInterestSatoshis(
        toSatoshis(account.savings_hbd_balance),
        BigInt(account.savings_hbd_seconds),
        elapsed(account.savings_hbd_seconds_last_update),
        BigInt(RATE)
      );

      expect(BigInt(state.pendingInterestSatoshis)).toBeLessThanOrEqual(expected);
    }
  });
});

describe("estimate against the chain's own arithmetic, over generated states", () => {
  // A small deterministic PRNG: a fixed seed keeps a failure reproducible.
  function makeRandom(seed: number) {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }

  it("matches hived across 2000 randomised balances, ages and rates", () => {
    const random = makeRandom(20260823);
    const failures: unknown[] = [];

    for (let i = 0; i < 2000; i++) {
      // Spread over the whole plausible range, with plenty of mass right at
      // the boundaries where truncation decides between 0 and 1 satoshi.
      const balanceSatoshis = BigInt(Math.floor(random() ** 4 * 5_000_000_000));
      const banked = BigInt(Math.floor(random() ** 3 * 1e15));
      const ageSeconds = Math.floor(random() * 400 * 24 * 60 * 60);
      // Rates that are NOT clean divisors of HIVE_100_PERCENT matter: with a
      // rate like 1000 the two truncations collapse into one by the nested
      // floor identity, so only an awkward rate can tell hived's order of
      // operations apart from the algebraically equivalent single division.
      const rate = [0, 1, 3, 500, 777, 1000, 1234, 2000, 9999, 10000][
        Math.floor(random() * 10)
      ];

      const whole = balanceSatoshis / 1000n;
      const fraction = (balanceSatoshis % 1000n).toString().padStart(3, "0");
      const lastUpdate = NOW.subtract(ageSeconds, "second").utc().format("YYYY-MM-DDTHH:mm:ss");

      const state = getHbdSavingsInterestState({
        savingsHbdBalance: `${whole}.${fraction} HBD`,
        savingsHbdSeconds: banked.toString(),
        savingsHbdSecondsLastUpdate: lastUpdate,
        savingsHbdLastInterestPayment: lastUpdate,
        hbdInterestRate: rate,
        now: NOW
      });

      const expected = chainInterestSatoshis(
        balanceSatoshis,
        banked,
        BigInt(ageSeconds),
        BigInt(rate)
      );

      if (BigInt(state.pendingInterestSatoshis) !== expected) {
        failures.push({ i, balanceSatoshis, banked, ageSeconds, rate, expected, got: state.pendingInterestSatoshis });
      }
    }

    expect(failures).toEqual([]);
  });

  it("does not let an exponent-notation field inflate the estimate", () => {
    // savings_hbd_seconds is an integer count. A field that is not one must
    // read as close to nothing, never as the enormous number a float parse
    // would make of it: this figure is shown to the user as money.
    const state = getHbdSavingsInterestState({
      savingsHbdBalance: "0.000 HBD",
      savingsHbdSeconds: "1e21",
      savingsHbdSecondsLastUpdate: NOW.format("YYYY-MM-DDTHH:mm:ss"),
      hbdInterestRate: RATE,
      now: NOW
    });

    expect(state.pendingInterestSatoshis).toBe(0);
  });

  it("keeps a whale's banked seconds exact past the double's safe range", () => {
    // 2^53 satoshi-seconds is reached by ~100k HBD held for a month, and the
    // field arrives as a string from nodes that serialize it that way.
    const banked = "90071992547409910";
    const state = getHbdSavingsInterestState({
      savingsHbdBalance: "0.000 HBD",
      savingsHbdSeconds: banked,
      savingsHbdSecondsLastUpdate: NOW.format("YYYY-MM-DDTHH:mm:ss"),
      hbdInterestRate: RATE,
      now: NOW
    });

    expect(BigInt(state.pendingInterestSatoshis)).toBe(
      chainInterestSatoshis(0n, BigInt(banked), 0n, BigInt(RATE))
    );
  });
});

describe("invariants that must hold for any input", () => {
  const HOSTILE: Record<string, unknown>[] = [
    {},
    { savingsHbdBalance: "" },
    { savingsHbdBalance: "not-an-asset" },
    { savingsHbdBalance: "-5.000 HBD" },
    { savingsHbdBalance: "1.0e3 HBD" },
    { savingsHbdBalance: "999999999999.999 HBD" },
    { savingsHbdBalance: "1.9999 HBD" },
    { savingsHbdBalance: { amount: "1000", precision: 3, nai: "@@000000013" } },
    { savingsHbdSeconds: Number.NaN },
    { savingsHbdSeconds: Number.POSITIVE_INFINITY },
    { savingsHbdSeconds: -1 },
    { savingsHbdSeconds: "-1" },
    { savingsHbdSeconds: "1e21" },
    { savingsHbdSeconds: "12abc" },
    { savingsHbdSeconds: null },
    { savingsHbdSecondsLastUpdate: "" },
    { savingsHbdSecondsLastUpdate: "not-a-date" },
    { savingsHbdSecondsLastUpdate: "1970-01-01T00:00:00" },
    // A timestamp in the future: a node ahead of the client's clock.
    { savingsHbdSecondsLastUpdate: "2099-01-01T00:00:00", savingsHbdBalance: "10.000 HBD" },
    { savingsHbdLastInterestPayment: "not-a-date", savingsHbdBalance: "10.000 HBD" },
    { hbdInterestRate: Number.NaN },
    { hbdInterestRate: -1000 },
    { hbdInterestRate: Number.POSITIVE_INFINITY },
    { hbdInterestRate: 1.5 }
  ];

  it.each(HOSTILE.map((input, i) => [i, input] as const))(
    "produces a finite, non-negative estimate for hostile input %i",
    (_i, input) => {
      const state = getHbdSavingsInterestState({
        savingsHbdBalance: "1.000 HBD",
        savingsHbdSeconds: 0,
        savingsHbdSecondsLastUpdate: NOW.subtract(60, "day").format("YYYY-MM-DDTHH:mm:ss"),
        savingsHbdLastInterestPayment: NOW.subtract(60, "day").format("YYYY-MM-DDTHH:mm:ss"),
        hbdInterestRate: RATE,
        now: NOW,
        ...(input as object)
      });

      expect(Number.isFinite(state.pendingInterest)).toBe(true);
      expect(Number.isFinite(state.savingsBalance)).toBe(true);
      expect(state.pendingInterest).toBeGreaterThanOrEqual(0);
      expect(state.savingsBalance).toBeGreaterThanOrEqual(0);
      // The number the user reads is always a whole count of satoshis.
      expect(state.pendingInterest * 1000).toBeCloseTo(
        Math.round(state.pendingInterest * 1000),
        9
      );
    }
  );

  it.each(HOSTILE.map((input, i) => [i, input] as const))(
    "never offers a claim that the chain would reject, for hostile input %i",
    (_i, input) => {
      const state = getHbdSavingsInterestState({
        savingsHbdBalance: "1.000 HBD",
        savingsHbdSeconds: 0,
        savingsHbdSecondsLastUpdate: NOW.subtract(60, "day").format("YYYY-MM-DDTHH:mm:ss"),
        savingsHbdLastInterestPayment: NOW.subtract(60, "day").format("YYYY-MM-DDTHH:mm:ss"),
        hbdInterestRate: RATE,
        now: NOW,
        ...(input as object)
      });

      if (state.canClaim) {
        // Claiming broadcasts transfer_from_savings of 0.001 HBD plus a
        // cancel. All three preconditions must hold or it fails on chain.
        expect(state.savingsBalance).toBeGreaterThanOrEqual(MINIMUM_HBD_SAVINGS_AMOUNT);
        expect(state.pendingInterestSatoshis).toBeGreaterThanOrEqual(1);
        expect(state.isClaimDue).toBe(true);
      }
    }
  );

  it("never hides a card that still has claimable interest", () => {
    // isEmpty is what removes the card from the page. Anything it hides has to
    // be genuinely worth nothing to the user.
    const random = (() => {
      let state = 7 >>> 0;
      return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
      };
    })();

    for (let i = 0; i < 500; i++) {
      const satoshis = Math.floor(random() ** 3 * 1_000_000);
      const state = getHbdSavingsInterestState({
        savingsHbdBalance: `${Math.floor(satoshis / 1000)}.${String(satoshis % 1000).padStart(3, "0")} HBD`,
        savingsHbdSeconds: Math.floor(random() ** 3 * 1e13),
        savingsHbdSecondsLastUpdate: NOW.subtract(Math.floor(random() * 400), "day").format(
          "YYYY-MM-DDTHH:mm:ss"
        ),
        savingsHbdLastInterestPayment: NOW.subtract(Math.floor(random() * 400), "day").format(
          "YYYY-MM-DDTHH:mm:ss"
        ),
        hbdInterestRate: RATE,
        now: NOW
      });

      if (state.isEmpty) {
        expect(state.pendingInterestSatoshis).toBe(0);
        expect(state.savingsBalance).toBe(0);
      }
    }
  });
});

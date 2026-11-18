import { describe, expect, it } from "vitest";
import {
  amountStep,
  operationAssetPrecision,
  truncateAmount
} from "@/features/wallet/operations/operation-amount";
import { availableForPowerDown, enginePrecisionStatus, isEngineLayer } from "@/features/wallet/operations/operation-amount";

// #2127: the wallet operations dialog used 3 decimals for every asset, so a
// Hive Engine token with 8 could not be sent below 0.001 and the rest of a
// balance was stranded.

describe("operationAssetPrecision", () => {
  const balances = [
    { symbol: "SWAP.BTC", precision: 8 },
    { symbol: "LEO", precision: 3 }
  ];

  it("takes an engine token's own precision", () => {
    expect(operationAssetPrecision(true, balances, "SWAP.BTC")).toBe(8);
  });

  it("keeps 3 for HIVE, HBD, HP and POINTS", () => {
    expect(operationAssetPrecision(false, balances, "HIVE")).toBe(3);
  });

  it("is unknown (null) for an engine token whose precision is not loaded, so nothing is sent", () => {
    expect(operationAssetPrecision(true, balances, "UNKNOWN")).toBeNull();
    expect(operationAssetPrecision(true, undefined, "SWAP.BTC")).toBeNull();
  });

  it("is unknown (null) when the token's metadata did not load, whatever precision it shows", () => {
    expect(
      operationAssetPrecision(true, [{ symbol: "NOMETA", precision: 0, precisionKnown: false }], "NOMETA")
    ).toBeNull();
  });

  it("takes a real precision of 0", () => {
    expect(operationAssetPrecision(true, [{ symbol: "WHOLE", precision: 0 }], "WHOLE")).toBe(0);
  });
});

describe("amountStep", () => {
  it("is one unit of the last decimal", () => {
    expect(amountStep(3)).toBe(0.001);
    expect(amountStep(8)).toBe(0.00000001);
    expect(amountStep(0)).toBe(1);
  });
});

describe("truncateAmount", () => {
  it("cuts, never rounds up, to the asset's decimals", () => {
    expect(truncateAmount(0.12345678, 8)).toBe("0.12345678");
    expect(truncateAmount(0.123456789, 8)).toBe("0.12345678");
    expect(truncateAmount(1.9999, 3)).toBe("1.999");
    expect(truncateAmount(0.29, 2)).toBe("0.29");
  });

  it("writes amounts below 0.001 in full, not in exponent form", () => {
    expect(truncateAmount(0.0005, 8)).toBe("0.00050000");
    expect(truncateAmount(1e-8, 8)).toBe("0.00000001");
  });

  it("never sends less than typed: no binary rounding error in the cut", () => {
    expect(truncateAmount(123456.00000001, 8)).toBe("123456.00000001");
    expect(truncateAmount(1234567.89, 8)).toBe("1234567.89000000");
    expect(truncateAmount(0.3, 8)).toBe("0.30000000");
    for (let i = 0; i < 2000; i++) {
      const typed = (Math.floor(Math.random() * 1e6 * 1e8) / 1e8).toFixed(8);
      expect(truncateAmount(Number(typed), 8)).toBe(typed);
    }
  });

  it("writes very large amounts without an exponent", () => {
    expect(truncateAmount(1e21, 3)).toBe("1000000000000000000000.000");
  });

  it("writes whole units for precision 0", () => {
    expect(truncateAmount(12.7, 0)).toBe("12");
  });
});

describe("isEngineLayer", () => {
  // The portfolio declares "engine"; an "ENGINE" check left #2127's precision
  // path unused.
  it.each([
    ["engine", true],
    ["ENGINE", true],
    ["Engine", true],
    ["hive", false],
    [undefined, false]
  ])("%s is engine: %s", (layer, expected) => {
    expect(isEngineLayer(layer)).toBe(expected);
  });
});

describe("enginePrecisionStatus", () => {
  it("says nothing for a token whose precision is known, or a native asset", () => {
    expect(enginePrecisionStatus(true, 8, false)).toBeNull();
    expect(enginePrecisionStatus(false, 3, false)).toBeNull();
  });

  it("says loading while the token's details are still on their way", () => {
    expect(enginePrecisionStatus(true, null, true)).toBe("loading");
  });

  it("says unavailable once loading ended without them", () => {
    expect(enginePrecisionStatus(true, null, false)).toBe("unavailable");
  });
});

describe("availableForPowerDown", () => {
  // The number input has step 0.001: float noise like 79.09999999999999 fails
  // its step check in some browsers.
  it.each([
    [100.1, 21, 0, "79.100"],
    [0.3, 0.1, 0, "0.200"],
    [10, 0, 0, "10.000"]
  ])("%s HP less %s delegated and %s pending is %s", (hp, delegated, pending, expected) => {
    const value = availableForPowerDown(hp, delegated, pending);
    expect(value.toFixed(3)).toBe(expected);
    expect(String(value).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(3);
  });

  it("never goes above what is available when inputs have more decimals", () => {
    // 100.0006 - 20.0004 = 80.0002: the largest 0.001 step within it is 80.000.
    expect(availableForPowerDown(100.0006, 20.0004, 0)).toBe(80);
    expect(availableForPowerDown(1.0009, 0, 0)).toBe(1);
  });

  it.each([
    [1_000_000.0009995, 0, 0, 1_000_000],
    [0.0009999995, 0, 0, 0],
    [80.0009999995, 0, 0, 80],
    [99_999_999.0009997, 0, 0, 99_999_999],
    [10_000_000.00099997, 0, 0, 10_000_000],
    [1_000_000.000999997, 0, 0, 1_000_000],
    [134_217_728.0009995, 0, 0, 134_217_728],
    [300_000_000.0009995, 0, 0, 300_000_000],
    [100_000_000, 99_999_999.9990003, 0, 0],
    [53251496.16843625, 21194934.226436343, 0, 32056561.941]
  ])("never rounds %s less %s and %s up past the net amount", (hp, delegated, pending, expected) => {
    // A remainder just short of the next thousandth is not float noise.
    expect(availableForPowerDown(hp, delegated, pending)).toBe(expected);
  });

  it("is the largest thousandth within the net amount for inputs with extra decimals", () => {
    for (let s = 1; s <= 40; s++) {
      let seed = s;
      const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 2000; i++) {
        const hp = rand() * 10 ** Math.floor(rand() * 9);
        const delegated = rand() * hp;
        const value = availableForPowerDown(hp, delegated, 0);
        const net = hp - delegated;
        // The float subtraction is the reference here, so allow its own error.
        const noise = Math.max(1, hp) * Number.EPSILON * 4;
        expect(value).toBeLessThanOrEqual(net + noise);
        expect(net - value).toBeLessThan(0.001 + noise);
        expect(String(value).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(3);
      }
    }
  });

  it("is exact for 3-decimal balances of any size", () => {
    // Seeded so a failure repeats.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 20000; i++) {
      const hpMilli = Math.floor(rand() * 1e11);
      const delMilli = Math.floor(rand() * hpMilli);
      const pendMilli = Math.floor(rand() * (hpMilli - delMilli));
      const expected = (hpMilli - delMilli - pendMilli) / 1000;
      expect(availableForPowerDown(hpMilli / 1000, delMilli / 1000, pendMilli / 1000)).toBe(expected);
    }
  });

  it("is 0, not negative, when more is delegated than held", () => {
    expect(availableForPowerDown(5, 10, 0)).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import {
  amountStep,
  operationAssetPrecision,
  truncateAmount
} from "@/features/wallet/operations/operation-amount";

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

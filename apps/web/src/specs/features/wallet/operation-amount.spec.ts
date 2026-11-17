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

  it("keeps 3 for HIVE, HBD, HP and POINTS, and for an engine token it cannot find", () => {
    expect(operationAssetPrecision(false, balances, "HIVE")).toBe(3);
    expect(operationAssetPrecision(true, balances, "UNKNOWN")).toBe(3);
    expect(operationAssetPrecision(true, undefined, "SWAP.BTC")).toBe(3);
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

  it("writes whole units for precision 0", () => {
    expect(truncateAmount(12.7, 0)).toBe("12");
  });
});

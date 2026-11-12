import { describe, it, expect } from "vitest";
import { parseToLamports, formatLamports, getSolExplorerUrl } from "./metamask-sol-transfer";

describe("parseToLamports", () => {
  it("converts 1 SOL to lamports", () => {
    expect(parseToLamports("1")).toBe(1_000_000_000n);
  });

  it("converts fractional SOL", () => {
    expect(parseToLamports("0.5")).toBe(500_000_000n);
  });

  it("converts small amounts", () => {
    expect(parseToLamports("0.000000001")).toBe(1n);
  });

  it("handles zero", () => {
    expect(parseToLamports("0")).toBe(0n);
  });

  it("handles large amounts without precision loss", () => {
    expect(parseToLamports("9007")).toBe(9_007_000_000_000n);
  });

  it("rejects non-zero digits beyond 9 decimals", () => {
    expect(() => parseToLamports("1.0000000019")).toThrow("more than 9 decimal");
  });

  it("allows trailing zeros beyond 9 decimals", () => {
    expect(parseToLamports("1.000000001000")).toBe(1_000_000_001n);
  });

  it("trims whitespace", () => {
    expect(parseToLamports("  1  ")).toBe(1_000_000_000n);
  });

  it("rejects malformed input with multiple dots", () => {
    expect(() => parseToLamports("1.2.3")).toThrow("Invalid amount");
  });

  it("rejects non-numeric input", () => {
    expect(() => parseToLamports("abc")).toThrow("Invalid amount");
  });

  it("rejects empty string", () => {
    expect(() => parseToLamports("")).toThrow("Invalid amount");
  });
});

describe("formatLamports", () => {
  it("formats 1 SOL", () => {
    expect(formatLamports(1_000_000_000n)).toBe("1");
  });

  it("formats 0.5 SOL", () => {
    expect(formatLamports(500_000_000n)).toBe("0.5");
  });

  it("formats zero", () => {
    expect(formatLamports(0n)).toBe("0");
  });

  it("trims trailing zeros", () => {
    expect(formatLamports(1_500_000_000n)).toBe("1.5");
  });

  it("formats with custom precision", () => {
    expect(formatLamports(123_456_789n, 4)).toBe("0.1234");
  });
});

describe("getSolExplorerUrl", () => {
  it("constructs correct explorer URL", () => {
    expect(getSolExplorerUrl("abc123")).toBe("https://explorer.solana.com/tx/abc123");
  });
});

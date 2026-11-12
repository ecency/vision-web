import { describe, it, expect, vi, afterEach } from "vitest";
import { parseToWei, formatWei, sendEvmTransfer } from "./metamask-evm-transfer";
import { EcencyWalletCurrency } from "../enums";

describe("parseToWei", () => {
  it("converts whole ETH to wei hex", () => {
    expect(parseToWei("1")).toBe("0xde0b6b3a7640000");
  });

  it("converts fractional ETH to wei hex", () => {
    expect(parseToWei("0.1")).toBe("0x16345785d8a0000");
  });

  it("converts large amounts", () => {
    expect(parseToWei("1000")).toBe("0x3635c9adc5dea00000");
  });

  it("handles zero", () => {
    expect(parseToWei("0")).toBe("0x0");
  });

  it("handles max precision (18 decimals)", () => {
    expect(parseToWei("0.000000000000000001")).toBe("0x1");
  });

  it("truncates beyond 18 decimals", () => {
    expect(parseToWei("0.0000000000000000019")).toBe("0x1");
  });

  it("rejects malformed input with multiple dots", () => {
    expect(() => parseToWei("1.2.3")).toThrow("Invalid amount");
  });

  it("rejects non-numeric input", () => {
    expect(() => parseToWei("abc")).toThrow("Invalid amount");
  });

  it("rejects empty string", () => {
    expect(() => parseToWei("")).toThrow("Invalid amount");
  });

  it("trims whitespace", () => {
    expect(parseToWei("  1  ")).toBe("0xde0b6b3a7640000");
  });
});

describe("formatWei", () => {
  it("formats 1 ETH", () => {
    expect(formatWei(1000000000000000000n)).toBe("1");
  });

  it("formats 0.1 ETH", () => {
    expect(formatWei(100000000000000000n)).toBe("0.1");
  });

  it("formats zero", () => {
    expect(formatWei(0n)).toBe("0");
  });

  it("preserves precision for large values", () => {
    // 9007.199254740992 ETH in wei — Number would lose precision
    const largeWei = 9007199254740992000000000000000000n;
    const result = formatWei(largeWei);
    expect(result).toBe("9007199254740992");
  });

  it("formats with custom decimal places", () => {
    expect(formatWei(123456789000000000n, 4)).toBe("0.1234");
  });

  it("trims trailing zeros", () => {
    expect(formatWei(1500000000000000000n)).toBe("1.5");
  });
});

describe("sendEvmTransfer (linked-account guard)", () => {
  const LINKED = "0xAbCdeF0000000000000000000000000000000001";
  const OTHER = "0x0000000000000000000000000000000000000002";

  function mockEthereum(activeAccount: string) {
    const sendTx = vi.fn().mockResolvedValue("0xhash");
    const request = vi.fn(async ({ method }: { method: string }) => {
      switch (method) {
        case "eth_chainId":
          return "0x1"; // matches ETH config -> ensureEvmChain returns early
        case "eth_requestAccounts":
          return [activeAccount];
        case "eth_sendTransaction":
          return sendTx();
        default:
          return null;
      }
    });
    (globalThis as any).window = { ethereum: { isMetaMask: true, request } };
    return { sendTx };
  }

  afterEach(() => {
    delete (globalThis as any).window;
    vi.restoreAllMocks();
  });

  it("throws ACCOUNT_MISMATCH and does not send when the active account differs from the linked wallet", async () => {
    const { sendTx } = mockEthereum(OTHER);
    await expect(
      sendEvmTransfer("0xrecipient", "0x1", EcencyWalletCurrency.ETH, LINKED)
    ).rejects.toThrow("ACCOUNT_MISMATCH");
    expect(sendTx).not.toHaveBeenCalled();
  });

  it("sends when the active account matches the linked wallet (case-insensitive)", async () => {
    const { sendTx } = mockEthereum(LINKED.toLowerCase());
    const hash = await sendEvmTransfer("0xrecipient", "0x1", EcencyWalletCurrency.ETH, LINKED);
    expect(hash).toBe("0xhash");
    expect(sendTx).toHaveBeenCalledTimes(1);
  });

  it("sends without a guard when no expectedFrom is given", async () => {
    const { sendTx } = mockEthereum(OTHER);
    const hash = await sendEvmTransfer("0xrecipient", "0x1", EcencyWalletCurrency.ETH);
    expect(hash).toBe("0xhash");
    expect(sendTx).toHaveBeenCalledTimes(1);
  });
});

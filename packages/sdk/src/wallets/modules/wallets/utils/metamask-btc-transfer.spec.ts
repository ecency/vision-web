import { describe, it, expect, vi, afterEach } from "vitest";

const walletsRef: { list: any[] } = { list: [] };
vi.mock("@wallet-standard/app", () => ({
  getWallets: () => ({ get: () => walletsRef.list })
}));

import {
  parseToSats,
  formatSats,
  getBtcExplorerUrl,
  sendBtcTransfer
} from "./metamask-btc-transfer";

const FROM = "bc1qfromaddressxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const TO = "bc1qtoaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

function makeBtcWallet(opts: {
  address?: string;
  response?: unknown;
  name?: string;
}) {
  const request = vi.fn(async (method: string, _params?: unknown) => {
    if (method === "getAddresses") {
      return {
        jsonrpc: "2.0",
        id: null,
        result: {
          addresses: opts.address
            ? [{ address: opts.address, purpose: "payment" }]
            : []
        }
      };
    }
    return opts.response ?? { jsonrpc: "2.0", id: null, result: { txid: "abc123" } };
  });
  return {
    wallet: {
      name: opts.name ?? "MetaMask",
      chains: ["bitcoin:mainnet"],
      accounts: [],
      features: {
        "bitcoin:connect": { version: "1.0.0", connect: vi.fn() },
        "sats-connect:": { provider: { request } }
      }
    },
    request
  };
}

afterEach(() => {
  walletsRef.list = [];
});

describe("parseToSats", () => {
  it("converts whole and fractional BTC", () => {
    expect(parseToSats("1")).toBe(100_000_000n);
    expect(parseToSats("0.5")).toBe(50_000_000n);
    expect(parseToSats("0.00000001")).toBe(1n);
  });

  it("trims whitespace and allows trailing zeros beyond 8 decimals", () => {
    expect(parseToSats("  0.001 ")).toBe(100_000n);
    expect(parseToSats("1.000000010")).toBe(100_000_001n);
  });

  it("rejects non-zero digits beyond 8 decimals", () => {
    expect(() => parseToSats("1.000000001")).toThrow("more than 8 decimal");
  });

  it("rejects malformed input", () => {
    expect(() => parseToSats("abc")).toThrow("Invalid amount");
    expect(() => parseToSats("")).toThrow("Invalid amount");
    expect(() => parseToSats("1.2.3")).toThrow("Invalid amount");
  });
});

describe("formatSats", () => {
  it("formats sats as BTC", () => {
    expect(formatSats(100_000_000n)).toBe("1");
    expect(formatSats(1n)).toBe("0.00000001");
    expect(formatSats(150_000_000n)).toBe("1.5");
    expect(formatSats(0n)).toBe("0");
  });
});

describe("getBtcExplorerUrl", () => {
  it("links to mempool.space", () => {
    expect(getBtcExplorerUrl("deadbeef")).toBe("https://mempool.space/tx/deadbeef");
  });
});

describe("sendBtcTransfer", () => {
  it("sends one recipient in sats through sats-connect sendTransfer and returns the txid", async () => {
    const { wallet, request } = makeBtcWallet({ address: FROM });
    walletsRef.list = [wallet];

    const txid = await sendBtcTransfer(TO, "0.001", FROM);

    expect(txid).toBe("abc123");
    const sendCall = request.mock.calls.find((c) => c[0] === "sendTransfer");
    expect(sendCall).toBeDefined();
    expect(sendCall![1]).toEqual({ recipients: [{ address: TO, amount: 100_000 }] });
  });

  it("rejects with the provider error message", async () => {
    const { wallet } = makeBtcWallet({
      address: FROM,
      response: { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Insufficient funds" } }
    });
    walletsRef.list = [wallet];

    await expect(sendBtcTransfer(TO, "0.001", FROM)).rejects.toThrow("Insufficient funds");
  });

  it("throws ACCOUNT_MISMATCH and never sends when the connected account differs from the linked one", async () => {
    const { wallet, request } = makeBtcWallet({ address: "bc1qsomeoneelse" });
    walletsRef.list = [wallet];

    await expect(sendBtcTransfer(TO, "0.001", FROM)).rejects.toThrow("ACCOUNT_MISMATCH");
    expect(request.mock.calls.some((c) => c[0] === "sendTransfer")).toBe(false);
  });

  it("treats bech32 addresses case-insensitively when matching the linked account", async () => {
    const { wallet, request } = makeBtcWallet({ address: FROM });
    walletsRef.list = [wallet];

    await expect(sendBtcTransfer(TO, "0.001", FROM.toUpperCase())).resolves.toBe("abc123");
    expect(request.mock.calls.some((c) => c[0] === "sendTransfer")).toBe(true);
  });

  it("explains that a Bitcoin account must be connected when getAddresses errors", async () => {
    const { wallet, request } = makeBtcWallet({});
    request.mockImplementation(async (method: string) =>
      method === "getAddresses"
        ? { jsonrpc: "2.0", id: null, error: { code: -32002, message: "No accounts found" } }
        : { jsonrpc: "2.0", id: null, result: { txid: "abc123" } }
    );
    walletsRef.list = [wallet];

    await expect(sendBtcTransfer(TO, "0.001")).rejects.toThrow(/No Bitcoin account connected/);
    expect(request.mock.calls.some((c) => c[0] === "sendTransfer")).toBe(false);
  });

  it("throws when the wallet returns no Bitcoin account", async () => {
    const { wallet, request } = makeBtcWallet({});
    walletsRef.list = [wallet];

    await expect(sendBtcTransfer(TO, "0.001")).rejects.toThrow(/No Bitcoin account/);
    expect(request.mock.calls.some((c) => c[0] === "sendTransfer")).toBe(false);
  });

  it("throws a clear error when no MetaMask Bitcoin wallet is registered", async () => {
    const { wallet } = makeBtcWallet({ address: FROM, name: "Xverse" });
    walletsRef.list = [wallet];

    await expect(sendBtcTransfer(TO, "0.001")).rejects.toThrow(/Enable Bitcoin in MetaMask/);
  });

  it("rejects a zero amount before contacting the wallet", async () => {
    const { wallet, request } = makeBtcWallet({ address: FROM });
    walletsRef.list = [wallet];

    await expect(sendBtcTransfer(TO, "0")).rejects.toThrow(/greater than zero/);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("isBtcMainnetAddress", () => {
  it("accepts bech32, P2PKH and P2SH mainnet addresses", async () => {
    const { isBtcMainnetAddress } = await import("./metamask-btc-transfer");
    expect(isBtcMainnetAddress("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")).toBe(true);
    expect(isBtcMainnetAddress("bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297")).toBe(true);
    expect(isBtcMainnetAddress("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2")).toBe(true);
    expect(isBtcMainnetAddress("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy")).toBe(true);
  });

  it("rejects testnet, EVM and malformed addresses", async () => {
    const { isBtcMainnetAddress } = await import("./metamask-btc-transfer");
    expect(isBtcMainnetAddress("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx")).toBe(false);
    expect(isBtcMainnetAddress("0x742d35Cc6634C0532925a3b844Bc454e4438f44e")).toBe(false);
    expect(isBtcMainnetAddress("bc1qIIII")).toBe(false);
    expect(isBtcMainnetAddress("")).toBe(false);
  });

  it("accepts all-uppercase bech32 but rejects mixed case", async () => {
    const { isBtcMainnetAddress } = await import("./metamask-btc-transfer");
    expect(isBtcMainnetAddress("BC1QAR0SRRR7XFKVY5L643LYDNW9RE59GTZZWF5MDQ")).toBe(true);
    expect(isBtcMainnetAddress("bc1QAR0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")).toBe(false);
  });

  it("rejects legacy addresses containing characters outside base58 (0, O, I, l)", async () => {
    const { isBtcMainnetAddress } = await import("./metamask-btc-transfer");
    expect(isBtcMainnetAddress("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVNO")).toBe(false);
    expect(isBtcMainnetAddress("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVNI")).toBe(false);
    expect(isBtcMainnetAddress("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVNl")).toBe(false);
  });
});

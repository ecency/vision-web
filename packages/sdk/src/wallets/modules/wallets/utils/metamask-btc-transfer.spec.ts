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

// BIP-173 test vectors (valid checksums)
const FROM = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
const TO = "bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3";

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
    const { wallet, request } = makeBtcWallet({ address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq" });
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

  it("rejects an invalid recipient before contacting the wallet", async () => {
    const { wallet, request } = makeBtcWallet({ address: FROM });
    walletsRef.list = [wallet];

    await expect(
      sendBtcTransfer("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5", "0.001", FROM)
    ).rejects.toThrow(/Invalid Bitcoin address/);
    expect(request).not.toHaveBeenCalled();
  });

  it("sends to an uppercase bech32 recipient in lowercase", async () => {
    const { wallet, request } = makeBtcWallet({ address: FROM });
    walletsRef.list = [wallet];

    await sendBtcTransfer(TO.toUpperCase(), "0.001", FROM);

    const sendCall = request.mock.calls.find((c) => c[0] === "sendTransfer");
    expect(sendCall![1]).toEqual({ recipients: [{ address: TO, amount: 100_000 }] });
  });

  it("reports a sats-connect user rejection as code 4001 (cancelled)", async () => {
    const { wallet } = makeBtcWallet({
      address: FROM,
      response: { jsonrpc: "2.0", id: null, error: { code: -32000, message: "User rejected the request." } }
    });
    walletsRef.list = [wallet];

    await expect(sendBtcTransfer(TO, "0.001", FROM)).rejects.toMatchObject({ code: 4001 });
  });

  it("surfaces a getAddresses failure other than a missing account", async () => {
    const { wallet, request } = makeBtcWallet({});
    request.mockImplementation(async (method: string) =>
      method === "getAddresses"
        ? { jsonrpc: "2.0", id: null, error: { code: -32603, message: "Scope not found." } }
        : { jsonrpc: "2.0", id: null, result: { txid: "abc123" } }
    );
    walletsRef.list = [wallet];

    await expect(sendBtcTransfer(TO, "0.001")).rejects.toThrow("Scope not found.");
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

  it("rejects addresses whose checksum is wrong", async () => {
    const { isBtcMainnetAddress } = await import("./metamask-btc-transfer");
    // BIP-173 vector with the last character changed
    expect(isBtcMainnetAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5")).toBe(false);
    // Base58Check with the last character changed
    expect(isBtcMainnetAddress("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN3")).toBe(false);
  });

  it("rejects a Base58Check address from another network", async () => {
    const { isBtcMainnetAddress } = await import("./metamask-btc-transfer");
    // Testnet P2PKH (version 0x6f): valid checksum, wrong network
    expect(isBtcMainnetAddress("mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn")).toBe(false);
  });

  it("follows BIP-350: witness v1 must use bech32m", async () => {
    const { isBtcMainnetAddress } = await import("./metamask-btc-transfer");
    expect(isBtcMainnetAddress("bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0")).toBe(true);
    // Same program with a bech32 (not bech32m) checksum
    expect(isBtcMainnetAddress("bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd")).toBe(false);
  });

  it("rejects a v0 program of the wrong length", async () => {
    const { isBtcMainnetAddress } = await import("./metamask-btc-transfer");
    // BIP-173 invalid vector: v0 with a 16-byte program
    expect(isBtcMainnetAddress("BC1QR508D6QEJXTDG4Y5R3ZARVARYV98GJ9P")).toBe(false);
  });

  it("accepts all-uppercase bech32 but rejects mixed case", async () => {
    const { isBtcMainnetAddress } = await import("./metamask-btc-transfer");
    expect(isBtcMainnetAddress("BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4")).toBe(true);
    expect(isBtcMainnetAddress("bc1QW508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")).toBe(false);
  });

  it("rejects legacy addresses containing characters outside base58 (0, O, I, l)", async () => {
    const { isBtcMainnetAddress } = await import("./metamask-btc-transfer");
    expect(isBtcMainnetAddress("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVNO")).toBe(false);
    expect(isBtcMainnetAddress("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVNI")).toBe(false);
    expect(isBtcMainnetAddress("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVNl")).toBe(false);
  });
});

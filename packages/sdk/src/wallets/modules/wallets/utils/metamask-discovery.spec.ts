import { describe, it, expect, vi, afterEach } from "vitest";

const walletsRef: { list: any[] } = { list: [] };
vi.mock("@wallet-standard/app", () => ({
  getWallets: () => ({ get: () => walletsRef.list })
}));

import { fetchMultichainAddresses } from "./metamask-discovery";
import { EcencyWalletCurrency } from "../enums";

afterEach(() => {
  walletsRef.list = [];
});

describe("fetchMultichainAddresses", () => {
  it("finds the BTC address of a MetaMask wallet that only has bitcoin:connect", async () => {
    const connect = vi.fn(async () => ({ accounts: [] }));
    walletsRef.list = [
      {
        name: "MetaMask",
        chains: ["bitcoin:mainnet"],
        features: { "bitcoin:connect": { version: "1.0.0", connect } },
        accounts: [{ address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", chains: ["bitcoin:mainnet"] }]
      }
    ];

    const result = await fetchMultichainAddresses();

    expect(connect).toHaveBeenCalled();
    expect(result[EcencyWalletCurrency.BTC]).toBe("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq");
  });

  it("still finds the SOL address through standard:connect", async () => {
    walletsRef.list = [
      {
        name: "MetaMask",
        chains: ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
        features: { "standard:connect": { version: "1.0.0", connect: vi.fn() } },
        accounts: [{ address: "SoLaddr", chains: ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"] }]
      }
    ];

    const result = await fetchMultichainAddresses();

    expect(result[EcencyWalletCurrency.SOL]).toBe("SoLaddr");
  });

  it("does not save a testnet BTC address", async () => {
    walletsRef.list = [
      {
        name: "MetaMask",
        chains: ["bitcoin:mainnet", "bitcoin:testnet"],
        features: { "bitcoin:connect": { version: "1.0.0", connect: vi.fn() } },
        accounts: [{ address: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx", chains: ["bitcoin:mainnet", "bitcoin:testnet"] }]
      }
    ];

    const result = await fetchMultichainAddresses();

    expect(result[EcencyWalletCurrency.BTC]).toBeUndefined();
  });

  it("ignores Bitcoin wallets that are not MetaMask", async () => {
    walletsRef.list = [
      {
        name: "Xverse",
        chains: ["bitcoin:mainnet"],
        features: { "bitcoin:connect": { version: "1.0.0", connect: vi.fn() } },
        accounts: [{ address: "bc1qother", chains: ["bitcoin:mainnet"] }]
      }
    ];

    const result = await fetchMultichainAddresses();

    expect(result[EcencyWalletCurrency.BTC]).toBeUndefined();
  });
});

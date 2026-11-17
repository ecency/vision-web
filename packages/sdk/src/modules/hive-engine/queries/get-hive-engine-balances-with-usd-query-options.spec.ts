import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { getHiveEngineBalancesWithUsdQueryOptions } from "./get-hive-engine-balances-with-usd-query-options";

const mockBalances = vi.hoisted(() => vi.fn());
const mockMetadata = vi.hoisted(() => vi.fn());
const mockMarket = vi.hoisted(() => vi.fn());

vi.mock("../requests", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../requests")>();
  return {
    ...actual,
    getHiveEngineTokensBalances: mockBalances,
    getHiveEngineTokensMetadata: mockMetadata,
    getHiveEngineTokensMarket: mockMarket,
  };
});

const runQuery = (options: ReturnType<typeof getHiveEngineBalancesWithUsdQueryOptions>) =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } }).fetchQuery(options);

// base/quote = 0.25 USD per HIVE
const dynamicProps = { base: 0.25, quote: 1 };

const balance = (symbol: string, amount: string) => ({
  account: "alice",
  balance: amount,
  delegationsIn: "0",
  delegationsOut: "0",
  pendingUndelegations: "0",
  pendingUnstake: "0",
  stake: "0",
  symbol,
});

describe("getHiveEngineBalancesWithUsdQueryOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMetadata.mockResolvedValue([]);
    mockMarket.mockResolvedValue([]);
  });

  it("says whether a token's precision came from its metadata", async () => {
    mockBalances.mockResolvedValue([balance("KNOWN", "1"), balance("WHOLE", "1"), balance("MISSING", "1")]);
    mockMetadata.mockResolvedValue([
      { symbol: "KNOWN", name: "Known", precision: 8, metadata: "{}" },
      { symbol: "WHOLE", name: "Whole", precision: 0, metadata: "{}" },
    ]);
    const result = await runQuery(getHiveEngineBalancesWithUsdQueryOptions("alice", dynamicProps, []));
    const by = (s: string) => result.find((t: any) => t.symbol === s)!;
    expect([by("KNOWN").precision, by("KNOWN").precisionKnown]).toEqual([8, true]);
    expect([by("WHOLE").precision, by("WHOLE").precisionKnown]).toEqual([0, true]);
    expect(by("MISSING").precisionKnown).toBe(false);
  });

  it("prices a held token from the metrics the caller supplied", async () => {
    mockBalances.mockResolvedValue([balance("LEO", "100")]);

    const result = await runQuery(
      getHiveEngineBalancesWithUsdQueryOptions("alice", dynamicProps, [
        { symbol: "LEO", lastPrice: "0.02" } as any,
      ])
    );

    expect(result[0].usdValue).toBeCloseTo(0.5, 10);
    expect(mockMarket).not.toHaveBeenCalled();
  });

  // The caller's list comes from an unfiltered metrics call capped at 1000 rows, so a
  // held token outside that page used to be valued at zero.
  it("fetches the price of a held token missing from the supplied metrics", async () => {
    mockBalances.mockResolvedValue([balance("LEO", "100"), balance("COFFEE", "1000")]);
    mockMarket.mockResolvedValue([{ symbol: "COFFEE", lastPrice: "0.01" }]);

    const result = await runQuery(
      getHiveEngineBalancesWithUsdQueryOptions("alice", dynamicProps, [
        { symbol: "LEO", lastPrice: "0.02" } as any,
      ])
    );

    expect(mockMarket).toHaveBeenCalledWith(undefined, ["COFFEE"]);
    expect(result.find((t) => t.symbol === "COFFEE")!.usdValue).toBeCloseTo(2.5, 10);
  });

  it("asks for every held symbol when the caller supplies no metrics", async () => {
    mockBalances.mockResolvedValue([balance("LEO", "1"), balance("BEE", "1")]);

    await runQuery(getHiveEngineBalancesWithUsdQueryOptions("alice", dynamicProps));

    expect(mockMarket).toHaveBeenCalledWith(undefined, ["LEO", "BEE"]);
  });

  it("does not ask for a price for SWAP.HIVE, which is priced off HIVE itself", async () => {
    mockBalances.mockResolvedValue([balance("SWAP.HIVE", "40")]);

    const result = await runQuery(
      getHiveEngineBalancesWithUsdQueryOptions("alice", dynamicProps)
    );

    expect(mockMarket).not.toHaveBeenCalled();
    expect(result[0].usdValue).toBeCloseTo(10, 10);
  });

  it("values a token with no market at zero rather than NaN", async () => {
    mockBalances.mockResolvedValue([balance("NOMARKET", "1000")]);

    const result = await runQuery(
      getHiveEngineBalancesWithUsdQueryOptions("alice", dynamicProps)
    );

    expect(result[0].usdValue).toBe(0);
  });
});

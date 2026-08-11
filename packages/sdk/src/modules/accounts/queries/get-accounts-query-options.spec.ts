import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { getAccountsQueryOptions } from "./get-accounts-query-options";

const mockCallRPC = vi.hoisted(() => vi.fn());

vi.mock("@/modules/core/hive-tx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/core/hive-tx")>();
  return {
    ...actual,
    callRPC: mockCallRPC
  };
});

// Drive the query through the public TanStack Query API. fetchQuery ignores
// `enabled`, so it exercises the queryFn directly.
const runQuery = (options: ReturnType<typeof getAccountsQueryOptions>) =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } }).fetchQuery(options);

describe("getAccountsQueryOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates the correct query key and disables the query for an empty list", () => {
    const options = getAccountsQueryOptions(["alice", "bob"]);
    expect(options.queryKey).toEqual(["accounts", "list", "alice", "bob"]);
    expect(options.enabled).toBe(true);
    expect(getAccountsQueryOptions([]).enabled).toBe(false);
  });

  it("parses the returned rows into full accounts", async () => {
    mockCallRPC.mockResolvedValue([
      {
        name: "alice",
        posting_json_metadata: JSON.stringify({ profile: { name: "Alice" } })
      }
    ]);

    const result = await runQuery(getAccountsQueryOptions(["alice"]));

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("alice");
    expect(result[0].profile?.name).toBe("Alice");
  });

  // Regression: ECENCY-NEXT-1GH9. Some nodes answer get_accounts with a
  // well-formed envelope carrying `result: null`. The payload validator makes
  // callRPC treat that as a node fault and fail over; should a null still slip
  // through, the queryFn must not crash in parseAccounts.
  describe("null get_accounts payload (node fault)", () => {
    it("passes a payload validator that rejects null and accepts arrays", async () => {
      mockCallRPC.mockResolvedValue([]);

      await runQuery(getAccountsQueryOptions(["alice"]));

      const validate = mockCallRPC.mock.calls[0]?.[5] as (result: unknown) => boolean;
      expect(validate).toBeTypeOf("function");
      expect(validate(null)).toBe(false);
      expect(validate(undefined)).toBe(false);
      expect(validate([])).toBe(true);
      expect(validate([{ name: "alice" }])).toBe(true);
    });

    it("resolves to an empty list instead of throwing a TypeError when callRPC still resolves null", async () => {
      mockCallRPC.mockResolvedValue(null);

      await expect(runQuery(getAccountsQueryOptions(["alice"]))).resolves.toEqual([]);
    });
  });

  // Regression: #1403. get_accounts takes account_name_type, so a name the chain
  // cannot hold asserts on deserialisation instead of answering "no such account",
  // and one bad entry takes the whole batch down with it.
  describe("names the chain cannot hold", () => {
    it("does not call the node at all when every name is unqueryable", async () => {
      await expect(
        runQuery(getAccountsQueryOptions(["aliveandthriving,"]))
      ).resolves.toEqual([]);
      expect(mockCallRPC).not.toHaveBeenCalled();
    });

    it("keeps the batch alive by dropping only the bad entry", async () => {
      mockCallRPC.mockResolvedValue([{ name: "alice" }]);

      const result = await runQuery(
        getAccountsQueryOptions(["alice", "sebastián.bilbao"])
      );

      expect(mockCallRPC.mock.calls[0]?.[1]).toEqual([["alice"]]);
      expect(result).toHaveLength(1);
    });
  });
});

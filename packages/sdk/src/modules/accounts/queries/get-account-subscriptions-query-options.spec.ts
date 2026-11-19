import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { getAccountSubscriptionsQueryOptions } from "./get-account-subscriptions-query-options";
import { normalizeAccountSubscriptions } from "@/modules/communities/types";

const mockCallRPC = vi.hoisted(() => vi.fn());

vi.mock("@/modules/core/hive-tx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/core/hive-tx")>();
  return {
    ...actual,
    callRPC: mockCallRPC
  };
});

const runQuery = (options: ReturnType<typeof getAccountSubscriptionsQueryOptions>) =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } }).fetchQuery(options);

describe("getAccountSubscriptionsQueryOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps only usable [name, title, role, label] rows", async () => {
    mockCallRPC.mockResolvedValue([null, "hive-1", ["", "x", "guest", ""], ["hive-2", "Two", "guest", ""]]);
    await expect(runQuery(getAccountSubscriptionsQueryOptions("alice"))).resolves.toEqual([
      ["hive-2", "Two", "guest", ""]
    ]);
    expect(mockCallRPC).toHaveBeenCalledWith(
      "bridge.list_all_subscriptions",
      { account: "alice" },
      undefined,
      undefined,
      expect.anything()
    );
  });

  it("resolves to an empty list when the bridge answers null", async () => {
    mockCallRPC.mockResolvedValue(null);
    await expect(runQuery(getAccountSubscriptionsQueryOptions("alice"))).resolves.toEqual([]);
  });
});

describe("normalizeAccountSubscriptions", () => {
  it("fills missing or non-string cells after the name with an empty string", () => {
    expect(normalizeAccountSubscriptions([["hive-3"], ["hive-4", 7, null, "lbl", "extra"]])).toEqual([
      ["hive-3", "", "", ""],
      ["hive-4", "", "", "lbl"]
    ]);
  });

  it("answers an empty list for anything that is not an array", () => {
    expect(normalizeAccountSubscriptions(undefined)).toEqual([]);
    expect(normalizeAccountSubscriptions({ 0: ["hive-1"] })).toEqual([]);
  });
});

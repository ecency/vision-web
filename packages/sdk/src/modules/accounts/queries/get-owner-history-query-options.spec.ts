import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLastAccountRecoveryQueryOptions,
  getOwnerHistoryQueryOptions,
} from "./get-owner-history-query-options";

const mockCallRPC = vi.hoisted(() => vi.fn());

vi.mock("@/modules/core/hive-tx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/core/hive-tx")>();
  return { ...actual, callRPC: mockCallRPC };
});

function runQueryFn<T extends { queryFn?: unknown }>(options: T) {
  return (options.queryFn as (ctx: Record<string, never>) => Promise<unknown>)({});
}

describe("getOwnerHistoryQueryOptions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the owner-history key and calls condenser_api.get_owner_history", async () => {
    const history = [
      {
        id: 1,
        account: "alice",
        previous_owner_authority: {
          weight_threshold: 1,
          account_auths: [],
          key_auths: [["STM1", 1]],
        },
        last_valid_time: "2026-11-01T10:00:00",
      },
    ];
    mockCallRPC.mockResolvedValueOnce(history);

    const options = getOwnerHistoryQueryOptions("alice");
    expect(options.queryKey).toEqual(["accounts", "owner-history", "alice"]);
    expect(options.enabled).toBe(true);
    await expect(runQueryFn(options)).resolves.toEqual(history);
    expect(mockCallRPC).toHaveBeenCalledWith("condenser_api.get_owner_history", ["alice"]);
  });

  it("is disabled without a username", () => {
    expect(getOwnerHistoryQueryOptions(undefined).enabled).toBe(false);
  });

  it("throws without a username even when run directly, and calls nothing", async () => {
    await expect(runQueryFn(getOwnerHistoryQueryOptions(undefined))).rejects.toThrow();
    expect(mockCallRPC).not.toHaveBeenCalled();
  });

  it("returns an empty history as an empty list", async () => {
    mockCallRPC.mockResolvedValueOnce([]);
    await expect(runQueryFn(getOwnerHistoryQueryOptions("alice"))).resolves.toEqual([]);
  });
});

describe("getLastAccountRecoveryQueryOptions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filters account history to recover_account and returns the newest timestamp", async () => {
    mockCallRPC.mockResolvedValueOnce([
      [10, { timestamp: "2025-01-01T00:00:00", op: ["recover_account", {}] }],
      [20, { timestamp: "2026-02-03T04:05:06", op: ["recover_account", {}] }],
    ]);

    const options = getLastAccountRecoveryQueryOptions("alice");
    expect(options.queryKey).toEqual(["accounts", "last-recovery", "alice"]);
    await expect(runQueryFn(options)).resolves.toBe("2026-02-03T04:05:06");
    expect(mockCallRPC.mock.calls[0].slice(0, 2)).toEqual([
      "condenser_api.get_account_history",
      ["alice", -1, 1000, 2 ** 25, 0],
    ]);
  });

  it("throws without a username even when run directly, and calls nothing", async () => {
    expect(getLastAccountRecoveryQueryOptions(undefined).enabled).toBe(false);
    await expect(runQueryFn(getLastAccountRecoveryQueryOptions(undefined))).rejects.toThrow();
    expect(mockCallRPC).not.toHaveBeenCalled();
  });

  it("returns null when the account was never recovered", async () => {
    mockCallRPC.mockResolvedValueOnce([]);
    await expect(runQueryFn(getLastAccountRecoveryQueryOptions("alice"))).resolves.toBeNull();
  });

  it("fails (retryable) instead of reporting 'never recovered' when the lookup fails", async () => {
    mockCallRPC.mockRejectedValueOnce(new Error("timeout"));
    await expect(runQueryFn(getLastAccountRecoveryQueryOptions("alice"))).rejects.toThrow("timeout");
  });

  it("asks callRPC to fail over on a non-array answer", async () => {
    mockCallRPC.mockResolvedValueOnce([]);
    await runQueryFn(getLastAccountRecoveryQueryOptions("alice"));
    const validator = mockCallRPC.mock.calls[0][5] as (r: unknown) => boolean;
    expect(typeof validator).toBe("function");
    expect(validator(null)).toBe(false);
    expect(validator([])).toBe(true);
  });

  it("throws on a non-array answer rather than treating it as none", async () => {
    mockCallRPC.mockResolvedValueOnce(null);
    await expect(runQueryFn(getLastAccountRecoveryQueryOptions("alice"))).rejects.toThrow();
  });
});

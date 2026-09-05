import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseBroadcastMutation = vi.hoisted(() => vi.fn());

vi.mock("@/modules/core/mutations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/core/mutations")>();
  return { ...actual, useBroadcastMutation: mockUseBroadcastMutation };
});

import { QueryKeys } from "@/modules/core";
import { normalizeBroadcastTrxId, useCurationRecommend } from "./use-curation-recommend";

const TX = "a".repeat(40);

describe("normalizeBroadcastTrxId", () => {
  it("reads tx_id from a BroadcastResult", () => {
    expect(normalizeBroadcastTrxId({ tx_id: TX, status: "unknown" })).toBe(TX);
  });

  it("reads id from a TransactionConfirmation", () => {
    expect(normalizeBroadcastTrxId({ id: TX, block_num: 1, trx_num: 0, expired: false })).toBe(TX);
  });

  it("is null for anything else", () => {
    expect(normalizeBroadcastTrxId(undefined)).toBeNull();
    expect(normalizeBroadcastTrxId({})).toBeNull();
    expect(normalizeBroadcastTrxId({ id: "short" })).toBeNull();
    expect(normalizeBroadcastTrxId("string")).toBeNull();
  });
});

describe("useCurationRecommend", () => {
  beforeEach(() => {
    mockUseBroadcastMutation.mockReset();
    mockUseBroadcastMutation.mockReturnValue({});
  });

  it("broadcasts with posting authority under the curation mutation key", () => {
    useCurationRecommend("alice", { adapter: {} } as any, "sync");
    const [key, username, , , , authority, options] = mockUseBroadcastMutation.mock.calls[0];
    expect(key).toEqual(["curation", "recommend"]);
    expect(username).toBe("alice");
    expect(authority).toBe("posting");
    expect(options).toEqual({ broadcastMode: "sync" });
  });

  it("builds the recommend op, and the unrecommend op when withdraw is set", () => {
    useCurationRecommend("alice");
    const operations = mockUseBroadcastMutation.mock.calls[0][2];

    const [recommend] = operations({ author: "bob", permlink: "p", reason: "newcomer" });
    expect(recommend[0]).toBe("custom_json");
    expect(recommend[1].required_posting_auths).toEqual(["alice"]);
    expect(JSON.parse(recommend[1].json)).toMatchObject({ op: "recommend", reason: "newcomer" });

    const [withdraw] = operations({ author: "bob", permlink: "p", withdraw: true });
    expect(JSON.parse(withdraw[1].json)).toEqual({ v: 1, op: "unrecommend", author: "bob", permlink: "p" });
  });

  it("invalidates the post and the recommendations keys after the broadcast", async () => {
    const adapter = { invalidateQueries: vi.fn().mockResolvedValue(undefined) };
    useCurationRecommend("alice", { adapter } as any, "sync");
    const onSuccess = mockUseBroadcastMutation.mock.calls[0][3];

    await onSuccess({ tx_id: TX }, { author: "bob", permlink: "p" });

    expect(adapter.invalidateQueries).toHaveBeenCalledWith([
      QueryKeys.curation.post("bob", "p"),
      ["curation", "recommendations"]
    ]);
  });
});

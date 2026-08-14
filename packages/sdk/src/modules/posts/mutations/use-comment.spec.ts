import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUseBroadcastMutation = vi.hoisted(() => vi.fn());

vi.mock("@/modules/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/core")>();
  return {
    ...actual,
    useBroadcastMutation: mockUseBroadcastMutation
  };
});

import { resolveContentActivityType, useComment } from "./use-comment";

describe("resolveContentActivityType", () => {
  it("earns post activity for a new top-level post", () => {
    expect(resolveContentActivityType({ parentAuthor: "" })).toBe(100);
  });

  it("earns comment activity for a new reply", () => {
    expect(resolveContentActivityType({ parentAuthor: "alice" })).toBe(110);
  });

  it("earns nothing when a post is edited", () => {
    expect(resolveContentActivityType({ parentAuthor: "", isUpdate: true })).toBeNull();
  });

  it("earns nothing when a reply is edited", () => {
    expect(resolveContentActivityType({ parentAuthor: "alice", isUpdate: true })).toBeNull();
  });

  it("still earns when isUpdate is explicitly false", () => {
    expect(resolveContentActivityType({ parentAuthor: "", isUpdate: false })).toBe(100);
  });
});

describe("useComment post-broadcast activity", () => {
  const makeAdapter = () => ({
    recordActivity: vi.fn().mockResolvedValue(undefined),
    invalidateQueries: vi.fn().mockResolvedValue(undefined)
  });

  // useBroadcastMutation is called with the post-broadcast handler in position 3.
  const runBroadcastHandler = async (adapter: any, variables: any) => {
    mockUseBroadcastMutation.mockReturnValue({} as any);
    useComment("alice", { adapter } as any);

    const onBroadcast = mockUseBroadcastMutation.mock.calls[0][3];
    await onBroadcast({ id: "tx-1", block_num: 42 }, variables);
  };

  const payload = {
    author: "alice",
    permlink: "a-post",
    parentAuthor: "",
    parentPermlink: "hive-125125",
    title: "t",
    body: "b",
    jsonMetadata: {}
  };

  beforeEach(() => {
    mockUseBroadcastMutation.mockReset();
  });

  it("records a post for a new top-level post", async () => {
    const adapter = makeAdapter();
    await runBroadcastHandler(adapter, payload);

    expect(adapter.recordActivity).toHaveBeenCalledWith(100, "tx-1", 42);
  });

  it("records a comment for a new reply", async () => {
    const adapter = makeAdapter();
    await runBroadcastHandler(adapter, { ...payload, parentAuthor: "bob" });

    expect(adapter.recordActivity).toHaveBeenCalledWith(110, "tx-1", 42);
  });

  it("records nothing when the payload is an update", async () => {
    const adapter = makeAdapter();
    await runBroadcastHandler(adapter, { ...payload, isUpdate: true });

    expect(adapter.recordActivity).not.toHaveBeenCalled();
  });

  it("still invalidates caches for an update", async () => {
    const adapter = makeAdapter();
    await runBroadcastHandler(adapter, { ...payload, isUpdate: true });

    expect(adapter.invalidateQueries).toHaveBeenCalled();
  });
});

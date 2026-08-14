import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUseBroadcastMutation = vi.hoisted(() => vi.fn());

vi.mock("@/modules/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/core")>();
  return {
    ...actual,
    useBroadcastMutation: mockUseBroadcastMutation
  };
});

import { useUpdateReply } from "./use-update-reply";

describe("useUpdateReply post-broadcast activity", () => {
  const payload = {
    author: "alice",
    permlink: "re-bob-a-post",
    parentAuthor: "bob",
    parentPermlink: "a-post",
    title: "",
    body: "edited body",
    jsonMetadata: {}
  };

  const makeAdapter = () => ({
    recordActivity: vi.fn().mockResolvedValue(undefined),
    invalidateQueries: vi.fn().mockResolvedValue(undefined)
  });

  // useBroadcastMutation is called with the post-broadcast handler in position 3.
  const runBroadcastHandler = async (adapter: any) => {
    mockUseBroadcastMutation.mockReturnValue({} as any);
    useUpdateReply("alice", { adapter } as any);

    const onBroadcast = mockUseBroadcastMutation.mock.calls[0][3];
    await onBroadcast({ id: "tx-1", block_num: 42 }, payload);
  };

  beforeEach(() => {
    mockUseBroadcastMutation.mockReset();
  });

  it("records no activity, because this mutation only ever edits existing content", async () => {
    const adapter = makeAdapter();
    await runBroadcastHandler(adapter);

    expect(adapter.recordActivity).not.toHaveBeenCalled();
  });

  it("still invalidates caches", async () => {
    const adapter = makeAdapter();
    await runBroadcastHandler(adapter);

    expect(adapter.invalidateQueries).toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockCallRPC = vi.hoisted(() => vi.fn());

vi.mock("@/modules/core/hive-tx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/core/hive-tx")>()),
  callRPC: mockCallRPC,
}));

import { ConfigManager } from "@/modules/core";
import { getContentRepliesQueryOptions } from "./get-content-replies-query-options";

const CENSORED = "This post is not available due to a copyright/fraudulent claim.";

const reply = (author: string, permlink: string) => ({
  author,
  permlink,
  title: "",
  body: `The reply ${permlink} as published on chain.`,
  json_metadata: { image: ["https://images.ecency.com/cover.jpg"] },
});

const run = async () => {
  const { queryFn } = getContentRepliesQueryOptions("alice", "a-post");
  return (await (queryFn as unknown as () => Promise<unknown>)()) as Record<string, unknown>[];
};

describe("getContentRepliesQueryOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ConfigManager.setDmcaLists({});
  });

  afterEach(() => ConfigManager.setDmcaLists({}));

  it("censors a listed reply and leaves the rest of the thread alone", async () => {
    // The other raw condenser post query. A takedown covers a reply the same
    // way it covers the post it hangs under (#1862).
    ConfigManager.setDmcaLists({ posts: ["@bob/listed-reply"] });
    mockCallRPC.mockResolvedValue([reply("bob", "listed-reply"), reply("carol", "fine-reply")]);

    const [listed, fine] = await run();

    expect(listed.body).toBe(CENSORED);
    expect(listed.json_metadata).toEqual({});
    expect(fine.body).toBe("The reply fine-reply as published on chain.");
  });

  it("passes an empty or missing result through as an array", async () => {
    mockCallRPC.mockResolvedValue(null);

    await expect(run()).resolves.toEqual([]);
  });
});

// Review D: condenser replies carry the whole voter list, like get_content.
describe("getContentRepliesQueryOptions: vote fields", () => {
  it("normalizes every reply", async () => {
    mockCallRPC.mockResolvedValue([{ ...reply("bob", "r"), active_votes: [{ voter: "x", rshares: 1, percent: 100 }] }]);
    const { queryFn } = getContentRepliesQueryOptions("alice", "a-post");
    const out = (await (queryFn as any)()) as any[];
    expect(out[0]).not.toHaveProperty("active_votes");
    expect(out[0].observer_vote_for).toBeNull();
  });
});

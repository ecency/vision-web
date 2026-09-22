import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockCallRPC = vi.hoisted(() => vi.fn());

vi.mock("@/modules/core/hive-tx", () => ({ callRPC: mockCallRPC }));

import { ConfigManager } from "@/modules/core";
import { getDiscussion } from "./requests";

/**
 * The real filter here, unlike requests.spec.ts, which mocks it away to test
 * the array guards. A thread is served whole by .discussion.json and rendered
 * under every post, so a takedown has to reach the comments too (#1862).
 */
const CENSORED =
  "This post is not available due to a copyright/fraudulent claim.";

const entry = (author: string, permlink: string) => ({
  author,
  permlink,
  title: `${author} says`,
  body: "The body as published on chain.",
  created: "2026-09-22T00:00:00",
  url: `/@${author}/${permlink}`,
  category: "hive-125125",
  updated: "2026-09-22T00:00:00",
});

describe("getDiscussion takedowns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ConfigManager.setDmcaLists({});
  });

  afterEach(() => ConfigManager.setDmcaLists({}));

  it("censors only the listed entries in the thread", async () => {
    ConfigManager.setDmcaLists({ posts: ["@bob/re-a-post"] });
    mockCallRPC.mockResolvedValue({
      "alice/a-post": entry("alice", "a-post"),
      "bob/re-a-post": entry("bob", "re-a-post"),
    });

    const thread = await getDiscussion("alice", "a-post");

    expect(thread?.["bob/re-a-post"].body).toBe(CENSORED);
    expect(thread?.["bob/re-a-post"].title).toBe("");
    expect(thread?.["alice/a-post"].body).toBe(
      "The body as published on chain.",
    );
    expect(Object.keys(thread ?? {})).toEqual([
      "alice/a-post",
      "bob/re-a-post",
    ]);
  });

  it("leaves a thread with nothing listed alone", async () => {
    mockCallRPC.mockResolvedValue({ "alice/a-post": entry("alice", "a-post") });

    const thread = await getDiscussion("alice", "a-post");

    expect(thread?.["alice/a-post"].body).toBe(
      "The body as published on chain.",
    );
  });

  it("passes a missing thread through", async () => {
    mockCallRPC.mockResolvedValue(null);

    await expect(getDiscussion("alice", "gone")).resolves.toBeNull();
  });
});

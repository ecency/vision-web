import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockCallRPC = vi.hoisted(() => vi.fn());

vi.mock("@/modules/core/hive-tx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/core/hive-tx")>()),
  callRPC: mockCallRPC,
}));

import { ConfigManager } from "@/modules/core";
import { getContentQueryOptions } from "./get-content-query-options";

/**
 * The real filter and the real lists, not a pass-through mock: what is being
 * checked is that a takedown actually reaches this query, which is the one the
 * agent endpoints, the oEmbed provider and the decks columns read (#1862).
 */
const CENSORED =
  "This post is not available due to a copyright/fraudulent claim.";

const entry = (overrides: Record<string, unknown> = {}) => ({
  author: "alice",
  permlink: "a-post",
  title: "A post",
  body: "The body as published on chain.",
  // The fields a caller reads off this query besides the body: the entry
  // metadata builder resolves a comment's root from root_author/root_permlink,
  // and the cards read json_metadata. A filter that rebuilt the entry from
  // body and title alone would drop them silently.
  root_author: "alice",
  root_permlink: "a-post",
  json_metadata: {
    description: "The summary the author published",
    image: ["https://images.ecency.com/cover.jpg"],
  },
  ...overrides,
});

const run = async (author: string, permlink: string) => {
  const { queryFn } = getContentQueryOptions(author, permlink);
  return (await (queryFn as unknown as () => Promise<unknown>)()) as Record<
    string,
    unknown
  >;
};

describe("getContentQueryOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ConfigManager.setDmcaLists({});
  });

  afterEach(() => ConfigManager.setDmcaLists({}));

  it("censors a post that is on the takedown list", async () => {
    ConfigManager.setDmcaLists({ posts: ["@alice/a-post"] });
    mockCallRPC.mockResolvedValue(entry());

    const result = await run("alice", "a-post");

    expect(result.body).toBe(CENSORED);
    expect(result.title).toBe("");
    // Blanked with them: a card reads the description and the image before it
    // reads the body, so these are what actually leak through oEmbed and .json.
    expect(result.json_metadata).toEqual({});
    // Everything else still comes through.
    expect(result.root_author).toBe("alice");
  });

  it("leaves a post that is not listed alone", async () => {
    ConfigManager.setDmcaLists({ posts: ["@bob/other"] });
    mockCallRPC.mockResolvedValue(entry());

    const result = await run("alice", "a-post");

    expect(result).toEqual(entry());
  });

  it("asks condenser_api for the post it was given", async () => {
    mockCallRPC.mockResolvedValue(entry());

    await run("alice", "a-post");

    expect(mockCallRPC).toHaveBeenCalledWith("condenser_api.get_content", [
      "alice",
      "a-post",
    ]);
  });

  it("passes a missing post through untouched", async () => {
    mockCallRPC.mockResolvedValue(null);

    await expect(run("alice", "gone")).resolves.toBeNull();
  });
});

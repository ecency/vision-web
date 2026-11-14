import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { getAccountPostsQueryOptions, getDiscussionQueryOptions } from "@ecency/sdk";
import { fetchThreads } from "@/app/decks/_components/columns/deck-threads-manager/threads-api";
import { isLocalEntry } from "@/app/decks/_components/utils";

// Hive API nodes stopped returning post_id from bridge reads (v1 and v2, every
// public node, 2026-11), and the value was never comparable across nodes. The
// Waves deck columns compared post_ids, so `undefined !== undefined` dropped
// every wave and each column showed "No content". A post is identified by
// author/permlink.

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

vi.mock("@/core/react-query", () => ({
  getQueryClient: () => queryClient,
  QueryIdentifiers: { THREADS: "threads", COMMUNITY_THREADS: "community-threads" }
}));

const HOST = "ecency.waves";
const CONTAINER = { author: HOST, permlink: "waves-20261114cgy7o3", created: "2026-11-14T06:40:00" };

function wave(author: string, permlink: string, created: string) {
  return { author, permlink, created, parent_author: HOST, parent_permlink: CONTAINER.permlink };
}

describe("deck Waves column without post_id", () => {
  beforeEach(() => {
    queryClient.clear();
    vi.mocked(getAccountPostsQueryOptions).mockImplementation(
      (...key: unknown[]) =>
        ({
          queryKey: ["account-posts", ...key],
          queryFn: async () => [{ ...CONTAINER }]
        }) as unknown as ReturnType<typeof getAccountPostsQueryOptions>
    );
    vi.mocked(getDiscussionQueryOptions).mockImplementation(
      (author?: string, permlink?: string) =>
        ({
          queryKey: ["discussion", author, permlink],
          queryFn: async () => ({
            [`${HOST}/${CONTAINER.permlink}`]: { ...CONTAINER, parent_author: "", parent_permlink: "waves" },
            "alice/wave-a": wave("alice", "wave-a", "2026-11-14T07:00:00"),
            "bob/wave-b": wave("bob", "wave-b", "2026-11-14T08:00:00"),
            // A reply to a wave, not a wave: not first level.
            "carol/re-wave-a": { ...wave("carol", "re-wave-a", "2026-11-14T09:00:00"), parent_author: "alice", parent_permlink: "wave-a" }
          })
        }) as unknown as ReturnType<typeof getDiscussionQueryOptions>
    );
  });

  it("lists the container's waves, keyed by author/permlink", async () => {
    const items = await fetchThreads(HOST);

    expect(items.map((i) => i.id).sort()).toEqual(["alice/wave-a", "bob/wave-b"]);
    expect(items.every((i) => i.host === HOST)).toBe(true);
    expect(items[0].container.id).toBe(`${HOST}/${CONTAINER.permlink}`);
  });
});

describe("isLocalEntry", () => {
  it("is false for a confirmed post the bridge served without post_id", () => {
    expect(isLocalEntry({ post_id: undefined })).toBe(false);
  });

  it("is true for a just-created wave (tempEntry stamps 1 or a uuid)", () => {
    expect(isLocalEntry({ post_id: 1 })).toBe(true);
    expect(isLocalEntry({ post_id: "6f1c2d1e-uuid" })).toBe(true);
  });
});

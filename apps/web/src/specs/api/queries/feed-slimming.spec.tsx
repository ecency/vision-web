import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Entry } from "@/entities";

const BODY = "the whole post body, which a card never renders";

function fullEntry(permlink: string): Entry {
  return {
    author: "alice",
    permlink,
    title: "A title",
    body: BODY,
    json_metadata: {},
    active_votes: [],
    created: "2026-08-01T00:00:00",
    updated: "2026-08-01T00:00:00",
    stats: { total_votes: 0, flag_weight: 0, gray: false, hide: false }
  } as unknown as Entry;
}

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@ecency/sdk");
  const page = (key: string) => ({
    queryKey: ["posts", key],
    initialPageParam: { author: undefined, permlink: undefined },
    getNextPageParam: () => undefined,
    queryFn: async () => [fullEntry("p1"), fullEntry("p2")]
  });
  return {
    ...actual,
    getPostsRankedInfiniteQueryOptions: () => page("ranked"),
    getAccountPostsInfiniteQueryOptions: () => page("account")
  };
});

import { usePostsFeedQuery } from "@/api/queries";

function firstPage(what: string, tag: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return renderHook(() => usePostsFeedQuery(what, tag, "ecency"), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  });
}

/**
 * The payload win from slimming is invisible to every other test: deleting
 * withSlimEntries from the feed builder leaves lint, typecheck and the rest of
 * the suite green, because they either test the helper in isolation or stub the
 * queryFn. These drive the real builder and look at what a card would receive.
 */
describe("feed queries ship slim entries", () => {
  it.each([
    ["a ranked feed", "trending", ""],
    ["a tag feed", "created", "photography"],
    ["a profile's posts", "posts", "@alice"],
    ["a profile's blog", "blog", "@alice"]
  ])("drops the body on %s", async (_label, what, tag) => {
    const { result } = firstPage(what, tag);
    await waitFor(() => expect(result.current.data?.pages?.[0]).toBeTruthy());

    const entries = result.current.data!.pages[0] as Entry[];
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.body).toBe("");
      // and the card still has something to render
      expect(entry.json_metadata?.description).toBeTruthy();
    }
  });

  it.each([
    ["comments", "comments"],
    ["replies", "replies"]
  ])("keeps the body on a profile's %s, where the card IS the body", async (_l, section) => {
    const { result } = firstPage(section, "@alice");
    await waitFor(() => expect(result.current.data?.pages?.[0]).toBeTruthy());

    const entries = result.current.data!.pages[0] as Entry[];
    for (const entry of entries) {
      expect(entry.body).toBe(BODY);
    }
  });
});

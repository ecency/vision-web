import React from "react";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { getPostsRankedQueryOptions } from "@ecency/sdk";
import { renderWithQueryClient } from "@/specs/test-utils";
import { DeckTrendingColumn } from "@/app/decks/_components/columns/deck-trending-column";

// The trending column stored bridge rows as they came. With no post_id or id on
// them, every row had an undefined React key and the column's "new posts"
// check (`!prev.some(vd => vd.id === id)`) saw nothing new after a reload.

const received: any[][] = [];

vi.mock("@/app/decks/_components/columns/generic-deck-with-data-column", () => ({
  GenericDeckWithDataColumn: ({ data }: { data: any[] }) => {
    received.push(data);
    return null;
  }
}));

vi.mock("@/app/decks/_components/columns/content-viewer", () => ({ DeckPostViewer: () => null }));
vi.mock("@/app/decks/_components/columns/deck-items", () => ({
  ListItemSkeleton: () => null,
  SearchListItem: () => null
}));

describe("DeckTrendingColumn ids", () => {
  beforeEach(() => {
    received.length = 0;
    vi.mocked(getPostsRankedQueryOptions).mockImplementation(
      (...key: unknown[]) =>
        ({
          queryKey: ["posts-ranked", ...key],
          queryFn: async () => [
            { author: "alice", permlink: "post-a" },
            { author: "bob", permlink: "post-b" }
          ]
        }) as any
    );
  });

  it("keys every trending row by author/permlink", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderWithQueryClient(
      <DeckTrendingColumn id="t" settings={{ updateIntervalMs: 0 } as any} />,
      { queryClient }
    );

    await waitFor(() => expect(received.at(-1)?.length).toBe(2));
    expect(received.at(-1)!.map((e) => e.id)).toEqual(["alice/post-a", "bob/post-b"]);
  });
});

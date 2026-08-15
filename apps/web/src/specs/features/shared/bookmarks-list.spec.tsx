import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QueryKeys } from "@ecency/sdk";
import { useActiveAccount } from "@/core/hooks/use-active-account";

const VIEWER = "viewer";

vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
  getBookmarksInfiniteQueryOptions: vi.fn(() => ({
    queryKey: ["bookmarks"],
    queryFn: async () => ({ data: [], pagination: { has_next: false } }),
    initialPageParam: 0,
    getNextPageParam: () => undefined,
    enabled: false
  })),
  getMutedUsersQueryOptions: vi.fn((username?: string) => ({
    queryKey: QueryKeys.accounts.mutedUsers(username!),
    queryFn: async () => [] as string[],
    enabled: false
  }))
}));

const useInfiniteQuery = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@tanstack/react-query")),
  useInfiniteQuery
}));

vi.mock("@/features/shared/bookmarks/bookmark-item", () => ({
  BookmarkItem: ({ author }: { author: string }) => <div data-testid="bookmark">{author}</div>
}));

import { BookmarksList } from "@/features/shared/bookmarks/bookmarks-list";

function bookmark(author: string, id: string) {
  return { _id: id, author, permlink: `p-${id}`, timestamp: id };
}

function renderList(
  rows: ReturnType<typeof bookmark>[],
  mutedAuthors: string[],
  hasNextPage: boolean
) {
  useInfiniteQuery.mockReturnValue({
    data: { pages: [{ data: rows }] },
    isPending: false,
    fetchNextPage: vi.fn(),
    hasNextPage,
    isFetchingNextPage: false
  });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(QueryKeys.accounts.mutedUsers(VIEWER), mutedAuthors);

  return render(
    <QueryClientProvider client={queryClient}>
      <BookmarksList onHide={vi.fn()} />
    </QueryClientProvider>
  );
}

describe("BookmarksList", () => {
  beforeEach(() => {
    vi.mocked(useActiveAccount).mockReturnValue({
      activeUser: { username: VIEWER } as any,
      username: VIEWER,
      account: null,
      isLoading: false,
      isPending: false,
      isError: false,
      isSuccess: true,
      error: null,
      refetch: vi.fn()
    } as any);
  });

  it("drops bookmarks of muted authors", () => {
    renderList([bookmark("alice", "1"), bookmark("spammer", "2")], ["spammer"], false);

    expect(screen.getAllByTestId("bookmark")).toHaveLength(1);
    expect(screen.getByText("alice")).toBeInTheDocument();
  });

  it("keeps Load more reachable when a whole page filters away", () => {
    // This list paginates by button, so losing it would strand the viewer with
    // no route to bookmarks they can see on later pages.
    renderList([bookmark("spammer", "1")], ["spammer"], true);

    expect(screen.queryByTestId("bookmark")).not.toBeInTheDocument();
    expect(screen.getByText("g.load-more")).toBeInTheDocument();
    expect(screen.queryByText("g.empty-list")).not.toBeInTheDocument();
  });

  it("says the list is empty only once there is nothing left to fetch", () => {
    renderList([bookmark("spammer", "1")], ["spammer"], false);

    expect(screen.getByText("g.empty-list")).toBeInTheDocument();
    expect(screen.queryByText("g.load-more")).not.toBeInTheDocument();
  });
});

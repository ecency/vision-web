import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QueryKeys } from "@ecency/sdk";
import type { Entry } from "@/entities";
import { mockEntry } from "@/specs/test-utils";
import { useActiveAccount } from "@/core/hooks/use-active-account";

const VIEWER = "viewer";

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
  getPromotedPostsQuery: vi.fn(() => ({
    queryKey: ["promoted"],
    queryFn: async () => [] as Entry[],
    enabled: false
  })),
  getMutedUsersQueryOptions: vi.fn((username?: string) => ({
    queryKey: QueryKeys.accounts.mutedUsers(username!),
    queryFn: async () => [] as string[],
    enabled: false
  }))
}));

const usePostsFeedQuery = vi.hoisted(() => vi.fn());
vi.mock("@/api/queries", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/api/queries")),
  usePostsFeedQuery
}));

vi.mock("next/navigation", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("next/navigation")),
  useSearchParams: () => new URLSearchParams("")
}));

vi.mock("@/features/shared/detect-bottom", () => ({
  DetectBottom: ({ paused }: { paused?: boolean }) => (
    <div data-testid="bottom" data-paused={String(!!paused)} />
  )
}));
vi.mock("@/features/shared/entry-list-content", () => ({
  EntryListContent: ({ entries }: { entries: Entry[] }) => (
    <div data-testid="list">{entries.length}</div>
  ),
  EntryListContentLoading: () => null,
  EntryListContentNoData: () => <div data-testid="no-data">No posts</div>
}));

import { FeedList } from "@/app/(dynamicPages)/feed/_components/feed-list";

function renderFeed(
  entries: Entry[] | Entry[][] | undefined,
  mutedAuthors: string[],
  hasNextPage: boolean,
  isError = false
) {
  const pages = entries === undefined ? undefined : Array.isArray(entries[0]) ? entries : [entries];
  const fetchNextPage = vi.fn();
  const refetch = vi.fn();
  usePostsFeedQuery.mockReturnValue({
    data: pages && { pages },
    isError,
    fetchNextPage,
    refetch,
    isLoading: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage
  });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(QueryKeys.accounts.mutedUsers(VIEWER), mutedAuthors);

  // "feed" is a personalized filter, the only kind that shows an empty state.
  render(
    <QueryClientProvider client={queryClient}>
      <FeedList filter="feed" tag="my" observer={VIEWER} />
    </QueryClientProvider>
  );
  return { fetchNextPage, refetch };
}

describe("FeedList", () => {
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

  it("shows the empty state once a fully muted feed has nothing left to fetch", () => {
    renderFeed([mockEntry({ author: "spammer", permlink: "a" })], ["spammer"], false);

    expect(screen.getByTestId("no-data")).toBeInTheDocument();
  });

  it("keeps quiet while everything loaded is muted but more pages are still to come", () => {
    renderFeed([mockEntry({ author: "spammer", permlink: "a" })], ["spammer"], true);

    expect(screen.queryByTestId("no-data")).not.toBeInTheDocument();
  });

  // The sentinel stays put after a failure and does not retry by itself, so a
  // feed whose first page failed had no way back short of a reload.
  it("offers a retry instead of the empty state when the first page failed", () => {
    const { fetchNextPage } = renderFeed(undefined, [], false, true);

    expect(screen.queryByTestId("no-data")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "g.try-again" }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("retries a complete feed whose refetch failed by refetching it", () => {
    const { fetchNextPage, refetch } = renderFeed([mockEntry({ author: "alice", permlink: "a" })], [], false, true);

    fireEvent.click(screen.getByRole("button", { name: "g.try-again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("offers no retry when nothing failed", () => {
    renderFeed([mockEntry({ author: "alice", permlink: "a" })], [], true);
    expect(screen.queryByRole("button", { name: "g.try-again" })).not.toBeInTheDocument();
  });

  it("stops loading on its own after three fully muted pages in a row", () => {
    const hidden = (n: number) => [mockEntry({ author: "spammer", permlink: `s${n}` })];
    renderFeed([[mockEntry({ author: "alice", permlink: "a" })], hidden(1), hidden(2), hidden(3)], ["spammer"], true);
    expect(screen.getByTestId("bottom")).toHaveAttribute("data-paused", "true");
  });

  it("keeps quiet while the viewer can still see something", () => {
    renderFeed([mockEntry({ author: "alice", permlink: "a" })], ["spammer"], false);

    expect(screen.queryByTestId("no-data")).not.toBeInTheDocument();
    expect(screen.getByTestId("bottom")).toHaveAttribute("data-paused", "false");
  });
});

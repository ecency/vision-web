import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QueryKeys } from "@ecency/sdk";
import type { Community, Entry } from "@/entities";
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

vi.mock("@/core/hooks", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/core/hooks")),
  useBottomPagination: () => vi.fn()
}));

vi.mock("@/features/shared", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/features/shared")),
  DetectBottom: ({ paused }: { paused?: boolean }) => (
    <div data-testid="bottom" data-paused={String(!!paused)} />
  ),
  EntryListContent: ({ entries }: { entries: Entry[] }) => (
    <div data-testid="list">{entries.length}</div>
  ),
  EntryListContentLoading: () => null,
  EntryListContentNoData: () => <div data-testid="no-data">No posts</div>
}));

import { CommunityContentInfiniteList } from "@/app/(dynamicPages)/community/[community]/_components/community-content-infinite-list";

const community = { name: "hive-101690", title: "Sports Talk Social" } as Community;

function renderList(
  initialEntryAuthors: string[],
  pageTwo: Entry[] | Entry[][],
  mutedAuthors: string[],
  hasNextPage = false
) {
  usePostsFeedQuery.mockReturnValue({
    // Page 1 is the server-rendered slice this component drops.
    data: { pages: [[], ...(Array.isArray(pageTwo[0]) ? (pageTwo as Entry[][]) : [pageTwo as Entry[]])] },
    fetchNextPage: vi.fn(),
    isFetching: false,
    hasNextPage,
    dataUpdatedAt: 1
  });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(QueryKeys.accounts.mutedUsers(VIEWER), mutedAuthors);

  return render(
    <QueryClientProvider client={queryClient}>
      <CommunityContentInfiniteList
        community={community}
        section="created"
        initialEntryAuthors={initialEntryAuthors}
      />
    </QueryClientProvider>
  );
}

describe("CommunityContentInfiniteList", () => {
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

  it("shows the empty state when every loaded author is muted", () => {
    renderList(["spammer"], [mockEntry({ author: "spammer", permlink: "p2" })], ["spammer"]);

    expect(screen.getByTestId("no-data")).toBeInTheDocument();
  });

  it("stops loading on its own after three fully muted pages in a row", () => {
    const hidden = (n: number) => [mockEntry({ author: "spammer", permlink: `s${n}` })];
    renderList(["alice"], [hidden(1), hidden(2), hidden(3)], ["spammer"], true);
    expect(screen.getByTestId("bottom")).toHaveAttribute("data-paused", "true");
  });

  it("keeps loading on its own when the newest page shows something", () => {
    const hidden = (n: number) => [mockEntry({ author: "spammer", permlink: `s${n}` })];
    renderList(["alice"], [hidden(1), hidden(2), hidden(3), [mockEntry({ author: "bob", permlink: "b" })]], ["spammer"], true);
    expect(screen.getByTestId("bottom")).toHaveAttribute("data-paused", "false");
  });

  it("keeps quiet while the server-rendered slice still has something to show", () => {
    renderList(["alice"], [], ["spammer"]);

    expect(screen.queryByTestId("no-data")).not.toBeInTheDocument();
  });

  it("keeps quiet while its own later pages still have something to show", () => {
    renderList(["spammer"], [mockEntry({ author: "alice", permlink: "p2" })], ["spammer"]);

    expect(screen.queryByTestId("no-data")).not.toBeInTheDocument();
  });

  it("keeps quiet while everything loaded is muted but more pages are still to come", () => {
    renderList(["spammer"], [mockEntry({ author: "spammer", permlink: "p2" })], ["spammer"], true);

    expect(screen.queryByTestId("no-data")).not.toBeInTheDocument();
  });
});

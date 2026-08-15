import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QueryKeys } from "@ecency/sdk";
import type { Entry, FullAccount } from "@/entities";
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

// Cards and the scroll sentinel are covered elsewhere; this spec is about which
// empty state the composed list settles on.
vi.mock("@/features/shared", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/features/shared")),
  DetectBottom: () => null,
  EntryListContent: ({ entries }: { entries: Entry[] }) => (
    <div data-testid="list">{entries.length}</div>
  ),
  EntryListContentLoading: () => null,
  EntryListContentNoData: () => <div data-testid="no-data">No posts</div>
}));

import { ProfileEntriesInfiniteList } from "@/app/(dynamicPages)/profile/[username]/_components/profile-entries-infinite-list";

const account = { name: "alice", profile: {} } as FullAccount;

function renderList(
  initialEntryAuthors: string[],
  pageTwo: Entry[],
  mutedAuthors: string[],
  hasNextPage = false
) {
  usePostsFeedQuery.mockReturnValue({
    // Page 1 is the server-rendered slice this component drops.
    data: { pages: [[], pageTwo] },
    fetchNextPage: vi.fn(),
    isFetching: false,
    isLoading: false,
    hasNextPage,
    isFetchingNextPage: false
  });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(QueryKeys.accounts.mutedUsers(VIEWER), mutedAuthors);

  return render(
    <QueryClientProvider client={queryClient}>
      <ProfileEntriesInfiniteList
        account={account}
        section="posts"
        initialEntryAuthors={initialEntryAuthors}
        initialPageEntriesCount={initialEntryAuthors.length}
        initialDataLoaded={true}
      />
    </QueryClientProvider>
  );
}

describe("ProfileEntriesInfiniteList", () => {
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

  it("shows the empty state when every visible entry belongs to a muted author", () => {
    renderList(["spammer"], [mockEntry({ author: "spammer", permlink: "p2" })], ["spammer"]);

    expect(screen.getByTestId("no-data")).toBeInTheDocument();
  });

  it("keeps quiet while the server-rendered page still has something to show", () => {
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

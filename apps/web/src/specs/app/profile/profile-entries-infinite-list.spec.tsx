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
const bottomHandlers = vi.hoisted(() => [] as unknown[]);
vi.mock("@/api/queries", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/api/queries")),
  usePostsFeedQuery
}));

// Cards and the scroll sentinel are covered elsewhere; this spec is about which
// empty state the composed list settles on, and which entries survive the
// pinned filter. The card ids the entries would render under are pinned by
// profile-pinned-duplicate.spec.tsx, which renders the real card chain.
vi.mock("@/features/shared", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/features/shared")),
  DetectBottom: ({ onBottom, paused }: { onBottom: () => void; paused?: boolean }) => (
    bottomHandlers.push(onBottom),
    <button data-testid="bottom" data-paused={String(!!paused)} onClick={onBottom}>
      bottom
    </button>
  ),
  EntryListContent: ({ entries }: { entries: Entry[] }) => (
    <div data-testid="list">{entries.map((e) => e.permlink).join(",") || entries.length}</div>
  ),
  EntryListContentLoading: () => null,
  EntryListContentNoData: () => <div data-testid="no-data">No posts</div>
}));

import { ProfileEntriesInfiniteList } from "@/app/(dynamicPages)/profile/[username]/_components/profile-entries-infinite-list";

const account = { name: "alice", profile: {} } as FullAccount;
// A profile that DOES carry `pinned`, for the cases about the pinned filter.
const pinningAccount = { name: "alice", profile: { pinned: "pinned-post" } } as FullAccount;

const pinned = mockEntry({ author: "alice", permlink: "pinned-post" });

function renderList(
  initialEntryAuthors: string[],
  pageTwo: Entry[] | Entry[][],
  mutedAuthors: string[],
  hasNextPage = false,
  pinnedKeys: string[] = [],
  forAccount: FullAccount = account,
  section = "posts"
) {
  const fetchNextPage = vi.fn();
  usePostsFeedQuery.mockReturnValue({
    // Page 1 is the server-rendered slice this component drops.
    data: { pages: [[], ...(Array.isArray(pageTwo[0]) ? (pageTwo as Entry[][]) : [pageTwo as Entry[]])] },
    fetchNextPage,
    isFetching: false,
    isLoading: false,
    hasNextPage,
    isFetchingNextPage: false
  });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(QueryKeys.accounts.mutedUsers(VIEWER), mutedAuthors);

  const makeUi = () => (
    <QueryClientProvider client={queryClient}>
      <ProfileEntriesInfiniteList
        account={forAccount}
        section={section}
        initialEntryAuthors={initialEntryAuthors}
        initialPageEntriesCount={initialEntryAuthors.length}
        pinnedKeys={pinnedKeys}
        initialDataLoaded={true}
      />
    </QueryClientProvider>
  );
  const { rerender } = render(makeUi());
  return { fetchNextPage, rerender: () => rerender(makeUi()) };
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

  // Every entry in the tab is hidden, so the sentinel never scrolls away: paging
  // on would walk the owner's whole history one request at a time.
  it("stops paging and says so when the viewer muted the profile owner", () => {
    const { fetchNextPage } = renderList(
      ["alice"],
      [mockEntry({ author: "alice", permlink: "p2" })],
      ["alice"],
      true
    );

    expect(screen.getByText("profile.muted-owner-title")).toBeInTheDocument();
    expect(screen.queryByTestId("bottom")).not.toBeInTheDocument();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  // The blog also carries the owner's reblogs of other authors, which the
  // viewer did not mute; the general cap handles a blog that shows nothing.
  it("keeps a muted owner's blog tab, reblogs and all", () => {
    renderList(["alice", "bob"], [mockEntry({ author: "bob", permlink: "r1" })], ["alice"], true, [], account, "blog");

    expect(screen.queryByText("profile.muted-owner-title")).not.toBeInTheDocument();
    expect(screen.getByTestId("list")).toHaveTextContent("r1");
  });

  it("keeps paging replies to a muted owner, which other people wrote", () => {
    const { fetchNextPage } = renderList(
      ["bob"],
      [mockEntry({ author: "bob", permlink: "r2" })],
      ["alice"],
      true,
      [],
      account,
      "replies"
    );

    expect(screen.queryByText("profile.muted-owner-title")).not.toBeInTheDocument();
    screen.getByTestId("bottom").click();
    expect(fetchNextPage).toHaveBeenCalled();
  });

  it("stops loading on its own after three pages in a row showed nothing", () => {
    const hidden = (n: number) => [mockEntry({ author: "spammer", permlink: `s${n}` })];
    renderList(["bob"], [hidden(1), hidden(2), hidden(3)], ["spammer"], true, [], account, "blog");
    expect(screen.getByTestId("bottom")).toHaveAttribute("data-paused", "true");
  });

  it("keeps loading on its own while fewer pages in a row showed nothing", () => {
    const hidden = (n: number) => [mockEntry({ author: "spammer", permlink: `s${n}` })];
    renderList(["bob"], [hidden(1), hidden(2)], ["spammer"], true, [], account, "blog");
    expect(screen.getByTestId("bottom")).toHaveAttribute("data-paused", "false");
  });

  // A failed fetch only flips isFetching back. A handler minted on every render
  // re-ran the sentinel then, and retried at once for as long as the API was down.
  it("keeps the same load-more handler when a fetch fails", () => {
    const { rerender } = renderList(["bob"], [mockEntry({ author: "bob", permlink: "p2" })], [], true);
    const first = bottomHandlers.at(-1);
    const result = usePostsFeedQuery.mock.results.at(-1)!.value;
    usePostsFeedQuery.mockReturnValue({ ...result, isFetching: true });
    rerender();
    usePostsFeedQuery.mockReturnValue({ ...result, isFetching: false });
    rerender();
    expect(bottomHandlers.at(-1)).toBe(first);
  });

  // Later pages get the same treatment page 1 got on the server: the pinned
  // post reaches this list as its cross-post wrapper, whose card renders the
  // pinned post itself (#1807). Comparing raw permlinks let it through.
  it("drops a later page's cross-post of the pinned post", () => {
    renderList(
      ["alice"],
      [
        mockEntry({ author: "alice", permlink: "pinned-post-hive-1", original_entry: pinned }),
        mockEntry({ author: "alice", permlink: "p2" })
      ],
      [],
      false,
      ["alice/pinned-post"],
      pinningAccount
    );

    expect(screen.getByTestId("list")).toHaveTextContent("p2");
    expect(screen.getByTestId("list")).not.toHaveTextContent("pinned-post-hive-1");
  });

  // Nothing is filtered without a pinned card above to show it instead.
  it("keeps the pinned post when the server rendered no pinned card", () => {
    renderList(
      ["alice"],
      [pinned, mockEntry({ author: "alice", permlink: "p2" })],
      [],
      false,
      // No pinned card was rendered, even though the profile names one: the
      // post keeps its normal feed position instead of vanishing.
      [],
      pinningAccount
    );

    expect(screen.getByTestId("list")).toHaveTextContent("pinned-post,p2");
  });
});

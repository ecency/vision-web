import React from "react";
import "@testing-library/jest-dom";
import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";
import { installFetchRouter, makePost, makeRoster, makeRow } from "./curation-test-utils";

const state = vi.hoisted(() => ({
  username: "member1" as string | undefined,
  entryFetch: vi.fn(),
  rendererProps: [] as Array<Record<string, unknown>>,
  voteClicks: [] as number[],
}));

vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@ecency/sdk");
  return {
    ...actual,
    // Author snapshot goes to the chain in production; keep the spec off the network.
    getAccountPostsQueryOptions: () => ({ queryKey: ["posts", "account-posts-page", "spec"], queryFn: async () => [], enabled: false }),
  };
});
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  ensureValidToken: vi.fn(async () => "code-1"),
}));
vi.mock("@/core/hooks/use-active-username", () => ({ useActiveUsername: () => state.username }));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: state.username ? { username: state.username } : null, account: null, isLoading: false }),
}));
vi.mock("@/core/global-store", () => ({
  useGlobalStore: (selector: (s: unknown) => unknown) => selector({ toggleUiProp: vi.fn(), activeUser: state.username ? { username: state.username } : null }),
}));
vi.mock("@/core/caches", () => ({
  EcencyEntriesCacheManagement: {
    getEntryQueryByPath: (author?: string, permlink?: string) => ({
      queryKey: ["posts", "entry", `/@${author}/${permlink}`],
      queryFn: () => state.entryFetch(author, permlink),
      enabled: !!author && !!permlink,
    }),
  },
}));
vi.mock("@/features/shared/post-content-renderer", () => ({
  PostContentRenderer: (props: Record<string, unknown>) => {
    state.rendererProps.push(props);
    return <div data-testid="renderer" />;
  },
}));
vi.mock("@/features/shared/entry-vote-btn", () => ({
  EntryVoteBtn: () => (
    <div
      className="entry-vote-btn"
      role="button"
      aria-expanded="false"
      onClick={() => state.voteClicks.push(1)}
    />
  ),
}));
vi.mock("@/features/shared/entry-votes", () => ({ EntryVotes: () => null }));
vi.mock("@/features/shared/entry-payout", () => ({ EntryPayout: () => null }));
vi.mock("@/features/shared/user-avatar", () => ({ UserAvatar: () => <span /> }));
vi.mock("@/features/shared/feedback", () => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/api/format-error", () => ({ formatError: (e: unknown) => [String(e), "common"] }));
vi.mock("@ui/modal/modal-sidebar", () => ({
  ModalSidebar: ({ show, children }: { show: boolean; children: React.ReactNode }) => (show ? <div role="dialog">{children}</div> : null),
}));
vi.mock("@/api/sdk-mutations/use-curation-recommend-mutation", () => ({
  useCurationRecommendMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { CurationQuickView } from "@/features/curation-desk/curation-quick-view";
import type { ViewerRole } from "@/features/curation-desk/types";

const member: ViewerRole = { username: "member1", kind: "member", role: null, isRoster: false, isTrial: false, canRewindCursor: false, isLoading: false };
const roster: ViewerRole = { ...member, username: "curator1", kind: "roster", role: "curator", isRoster: true };

const noop = () => {};

function renderDrawer(props: Partial<React.ComponentProps<typeof CurationQuickView>>) {
  return renderWithQueryClient(
    <CurationQuickView
      row={null}
      neighbour={null}
      viewer={member}
      recommendationsEnabled
      onClose={noop}
      onPrev={noop}
      onNext={noop}
      onReviewed={noop}
      onSkip={noop}
      onSnooze={noop}
      onFlag={noop}
      onNote={noop}
      onSaveNote={noop}
      recommendRef={null}
      {...props}
    />
  );
}

describe("CurationQuickView", () => {
  let router: ReturnType<typeof installFetchRouter>;
  const row = makeRow({ post_id: 1, author: "alice", permlink: "morning-light" });
  const next = makeRow({ post_id: 2, author: "bob", permlink: "second" });

  beforeEach(() => {
    state.username = "member1";
    state.entryFetch.mockReset();
    state.entryFetch.mockImplementation(async (author: string, permlink: string) => ({
      author,
      permlink,
      body: `body of ${permlink}`,
      json_metadata: { image: ["https://images.ecency.com/p/x.png"] },
      active_votes: [],
    }));
    state.rendererProps.length = 0;
    state.voteClicks.length = 0;
    router = installFetchRouter()
      .on(/curation-desk\/roster$/, () => makeRoster())
      .on(/curation-desk\/post\//, () => makePost(row));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("fetches the entry once on expand and hands its body to PostContentRenderer", async () => {
    renderDrawer({ row });
    await screen.findByTestId("renderer");
    expect(state.entryFetch).toHaveBeenCalledTimes(1);
    expect(state.entryFetch).toHaveBeenCalledWith("alice", "morning-light");
    expect(state.rendererProps[state.rendererProps.length - 1].value).toBe("body of morning-light");
  });

  it("never prefetches while the drawer is closed", async () => {
    vi.useFakeTimers();
    renderDrawer({ row: null, neighbour: next });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(state.entryFetch).not.toHaveBeenCalled();
  });

  it("prefetches only the immediate neighbour after a 300 ms debounce while open", async () => {
    vi.useFakeTimers();
    renderDrawer({ row, neighbour: next });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(state.entryFetch.mock.calls.filter(([a]) => a === "bob")).toHaveLength(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(state.entryFetch.mock.calls.filter(([a]) => a === "bob")).toHaveLength(1);
    expect(state.entryFetch).toHaveBeenCalledTimes(2);
  });

  it("renders Withdraw from an is_self recommender row on the viewer's own post", async () => {
    state.username = "alice";
    router.on(/curation-desk\/post\//, () =>
      makePost(row, { recommend_count: 0, recommenders: [{ username: "alice", rep: 60, reason: "quality", at: "2026-09-05T11:00:00Z", has_meta: true, is_self: true }] })
    );
    renderDrawer({ row, viewer: { ...member, username: "alice" } });
    expect(await screen.findByLabelText("curation-desk.recommend.withdraw-aria")).toBeInTheDocument();
    expect(screen.queryByLabelText("curation-desk.recommend.aria")).toBeNull();
  });

  it("shows the team layer and the dismiss action to the roster only", async () => {
    router.on(/curation-desk\/post\//, () =>
      makePost(row, { recommend_count: 2, unique_recommenders: 1, recommenders: [{ username: "x", rep: 50, reason: "other", at: "2026-09-05T11:00:00Z", has_meta: false }] })
    );
    const withMarks = {
      ...row,
      overlay: { signals: null, flags: {}, excluded_reason: null, team_mark: "reviewed" as const, team_mark_by: "riyat", resurfaced_at: null, notes_count: 0, marks: [{ curator: "riyat", state: "reviewed" as const, updated_at: "2026-09-05T11:58:00Z" }] },
    };
    const { unmount } = renderDrawer({ row: withMarks, viewer: roster });
    expect(await screen.findByLabelText("curation-desk.reco.dismiss")).toBeInTheDocument();
    expect(screen.getByText("curation-desk.quick-view.team")).toBeInTheDocument();
    expect(screen.getByText("curation-desk.reco.collapse")).toBeInTheDocument();
    unmount();

    renderDrawer({ row: withMarks, viewer: member });
    await screen.findByTestId("renderer");
    expect(screen.queryByLabelText("curation-desk.reco.dismiss")).toBeNull();
    expect(screen.queryByText("curation-desk.quick-view.team")).toBeNull();
  });

  it("never offers Dismiss to a trial curator (the route answers them 403)", async () => {
    router.on(/curation-desk\/post\//, () =>
      makePost(row, { recommend_count: 2, unique_recommenders: 2, recommenders: [] })
    );
    renderDrawer({ row, viewer: { ...roster, username: "trial1", role: "trial", isTrial: true } });
    await screen.findByTestId("renderer");
    expect(screen.queryByLabelText("curation-desk.reco.dismiss")).toBeNull();
    expect(screen.queryByLabelText("curation-desk.reco.restore")).toBeNull();
  });

  it("flips Dismiss to Restore once the overlay carries reco_dismissed_at", async () => {
    router
      .on(/curation-desk\/post\//, () => makePost(row, { recommend_count: 2, unique_recommenders: 2, recommenders: [] }))
      .on(/curation-desk\/recommendation-dismiss$/, () => ({ row }));
    const dismissed = {
      ...row,
      overlay: {
        signals: null,
        flags: {},
        excluded_reason: null,
        team_mark: null,
        team_mark_by: null,
        resurfaced_at: null,
        reco_dismissed_at: "2026-09-05T11:40:00Z",
        marks: [],
        notes_count: 0,
      },
    };
    renderDrawer({ row: dismissed, viewer: roster });
    const restore = await screen.findByLabelText("curation-desk.reco.restore");
    expect(screen.queryByLabelText("curation-desk.reco.dismiss")).toBeNull();
    await act(async () => {
      restore.click();
    });
    const [call] = router.callsTo(/recommendation-dismiss$/);
    expect(call.body).toMatchObject({ author: "alice", permlink: "morning-light", action: "restore" });
  });

  it("clicks the vote button when the entry arrives, not after a fixed delay", async () => {
    const onVoteHandled = vi.fn();
    let resolveEntry: ((value: unknown) => void) | undefined;
    state.entryFetch.mockImplementation(
      (author: string, permlink: string) =>
        new Promise((resolve) => {
          resolveEntry = () =>
            resolve({ author, permlink, body: "slow body", json_metadata: {}, active_votes: [] });
        })
    );
    renderDrawer({ row, voteOnOpen: true, onVoteHandled });

    // The slider does not exist yet, so nothing was clicked and the flag stands.
    await act(async () => {});
    expect(state.voteClicks).toHaveLength(0);
    expect(onVoteHandled).not.toHaveBeenCalled();

    await act(async () => {
      resolveEntry?.(undefined);
    });
    await waitFor(() => expect(state.voteClicks).toHaveLength(1));
    expect(onVoteHandled).toHaveBeenCalledTimes(1);
  });
});

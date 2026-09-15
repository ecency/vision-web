import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurationRosterRow } from "@ecency/sdk";
import { renderWithQueryClient } from "@/specs/test-utils";
import { installFetchRouter, makeOverlay, makePost, makeRoster, makeRosterPage, makeRow } from "./curation-test-utils";

const state = vi.hoisted(() => ({
  username: "curator1" as string | undefined,
  entryFetch: vi.fn(),
  voteClicks: [] as string[],
  toggleUiProp: vi.fn(),
}));

vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@ecency/sdk");
  return {
    ...actual,
    // The drawer's author snapshot goes to the chain in production; keep the
    // spec off the network.
    getAccountPostsQueryOptions: () => ({ queryKey: ["posts", "account-posts-page", "spec"], queryFn: async () => [], enabled: false }),
  };
});
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  ensureValidToken: vi.fn(async () => "code-1"),
}));
vi.mock("@/config", () => ({
  EcencyConfigManager: {
    useConfig: (condition: (config: unknown) => unknown) =>
      condition({ visionFeatures: { curationDesk: { enabled: true, recommendations: { enabled: true } } } }),
    CONFIG: { visionFeatures: { points: { enabled: true } } },
  },
}));
vi.mock("@/core/hooks/use-active-username", () => ({ useActiveUsername: () => state.username }));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: state.username ? { username: state.username } : null, account: null, isLoading: false }),
}));
vi.mock("@/core/global-store", () => ({
  useGlobalStore: (selector: (s: unknown) => unknown) =>
    selector({ toggleUiProp: state.toggleUiProp, activeUser: state.username ? { username: state.username } : null }),
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
  PostContentRenderer: () => <div data-testid="renderer" />,
}));
vi.mock("@/features/shared/entry-vote-btn", () => ({
  EntryVoteBtn: ({ entry }: { entry: { author: string; permlink: string } }) => (
    <div
      className="entry-vote-btn"
      role="button"
      aria-expanded="false"
      onClick={() => state.voteClicks.push(`${entry.author}/${entry.permlink}`)}
    />
  ),
}));
vi.mock("@/features/shared/entry-votes", () => ({ EntryVotes: () => null }));
vi.mock("@/features/shared/entry-payout", () => ({ EntryPayout: () => null }));
vi.mock("@/features/shared/entry-tip-btn", () => ({
  EntryTipBtn: ({ trigger }: { trigger: (open: () => void) => React.ReactNode }) => <>{trigger(() => {})}</>,
}));
vi.mock("@/features/shared/comment", () => ({ Comment: () => <div data-testid="comment-box" /> }));
vi.mock("@/api/mutations", () => ({ useCreateReply: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/features/shared/user-avatar", () => ({ UserAvatar: () => <span /> }));
vi.mock("@/features/shared/feedback", () => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/api/format-error", () => ({ formatError: (e: unknown) => [String(e), "common"] }));
// The real drawer mounts its surface a frame after `show` flips.
vi.mock("@ui/modal/modal-sidebar", () => ({
  ModalSidebar: ({ show, children }: { show: boolean; children: React.ReactNode }) => {
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => {
      if (!show) {
        setMounted(false);
        return;
      }
      const frame = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(frame);
    }, [show]);
    return show && mounted ? <div role="dialog">{children}</div> : null;
  },
}));
vi.mock("@ui/modal", () => ({
  Modal: ({ show, children }: { show: boolean; children: React.ReactNode }) => (show ? <div role="dialog">{children}</div> : null),
  ModalHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/api/sdk-mutations/use-curation-recommend-mutation", () => ({
  useCurationRecommendMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { CurationRecommendationsView } from "@/features/curation-desk/curation-recommendations-view";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function item(overrides: Record<string, unknown> = {}) {
  return {
    author: "alice",
    permlink: "morning-light",
    title: "Morning light",
    created: new Date(Date.now() - 30 * 60_000).toISOString(),
    first_image: null,
    recommend_count: 2,
    unique_recommenders: 2,
    no_meta_count: 0,
    reasons: { quality: 2 },
    recommenders: [{ username: "curator2", rep: 61, reason: "quality", at: new Date().toISOString(), has_meta: true }],
    ...overrides,
  };
}

/**
 * The same post as the roster feed's recommended view answers it, which is
 * what a curator's list reads: a desk row with an overlay, plus the fields
 * route 4 draws.
 */
function recoRow(overrides: Record<string, unknown> = {}, postId = 77): CurationRosterRow {
  const { reasons, recommenders, no_meta_count, ...rest } = item(overrides);
  return {
    ...makeRow({ post_id: postId, overlay: makeOverlay(), ...(rest as Partial<CurationRosterRow>) }),
    reasons,
    recommenders,
    no_meta_count,
  } as CurationRosterRow;
}

/**
 * The recommended list is the other place a curator meets a post, and it used
 * to carry Recommend and Dismiss alone: handling one of these meant finding it
 * again in the queue. It now renders the desk's row toolbar.
 */
describe("recommended list row actions", () => {
  let router: ReturnType<typeof installFetchRouter>;
  let marks: Array<Record<string, unknown>>;
  const post = makeRow({ post_id: 77, author: "alice", permlink: "morning-light", word_count: 812 });

  beforeEach(() => {
    state.username = "curator1";
    state.voteClicks.length = 0;
    state.entryFetch.mockReset();
    state.entryFetch.mockImplementation(async (author: string, permlink: string) => ({
      author,
      permlink,
      body: `body of ${permlink}`,
      json_metadata: {},
      active_votes: [],
    }));
    marks = [];
    router = installFetchRouter()
      .on(/curation-desk\/roster$/, () => makeRoster(["curator1"]))
      .on(/curation-desk\/roster-feed/, () => makeRosterPage([recoRow()]))
      .on(/curation-desk\/recommendations/, () => ({ items: [item()], next_cursor: null }))
      .on(/curation-desk\/marks$/, () => ({ items: marks, next_cursor: null }))
      .on(/curation-desk\/post\//, () => makePost(post));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Renders the tab and hands back the one row its route answers with. Scoped
   * through the toolbar rather than the list item, since each row nests a list
   * of its recommenders and those are list items too.
   */
  async function row() {
    renderWithQueryClient(<CurationRecommendationsView />);
    const toolbar = await screen.findByRole("toolbar");
    return within(toolbar.closest("li") as HTMLElement);
  }

  it("gives a curator the same controls the queue row offers", async () => {
    const listRow = await row();
    await waitFor(() => expect(listRow.getByLabelText("curation-desk.actions.reviewed")).toBeInTheDocument());
    for (const label of [
      "curation-desk.actions.read-key",
      "curation-desk.actions.vote",
      "curation-desk.actions.snooze",
      "curation-desk.actions.flag",
      "curation-desk.actions.note",
      "curation-desk.actions.open",
      "curation-desk.reco.dismiss",
    ]) {
      expect(listRow.getByLabelText(label)).toBeInTheDocument();
    }
  });

  /**
   * Route 4 is public and edge cached, so it cannot leave out what the team
   * handled. A curator reads the roster feed's recommended view instead, with
   * every handled kind hidden, and still sees who recommended the post.
   */
  it("reads a curator's list from the roster feed, with handled posts left out", async () => {
    const listRow = await row();
    expect(listRow.getByText("@curator2")).toBeInTheDocument();
    expect(router.callsTo(/curation-desk\/roster-feed/)[0].body).toMatchObject({
      view: "recommended",
      sort: "unique",
    });
    const body = router.callsTo(/curation-desk\/roster-feed/)[0].body as Record<string, unknown>;
    // The desk defaults each hide flag to on, so an absent flag hides too.
    for (const key of ["hide_curated", "hide_reviewed", "hide_snoozed"]) {
      expect(body[key] === undefined || body[key] === true).toBe(true);
    }
    expect(router.callsTo(/curation-desk\/recommendations/)).toHaveLength(0);
  });

  it("offers a member the reader's controls and none of the marks", async () => {
    state.username = "member1";
    const listRow = await row();
    expect(listRow.getByLabelText("curation-desk.actions.read-key")).toBeInTheDocument();
    expect(listRow.getByLabelText("curation-desk.actions.vote")).toBeInTheDocument();
    expect(listRow.getByLabelText("curation-desk.recommend.aria")).toBeInTheDocument();
    for (const label of [
      "curation-desk.actions.reviewed",
      "curation-desk.actions.snooze",
      "curation-desk.actions.flag",
      "curation-desk.actions.note",
      "curation-desk.reco.dismiss",
    ]) {
      expect(listRow.queryByLabelText(label)).toBeNull();
    }
    // A member has no team marks to hide, so they keep the public list.
    expect(router.callsTo(/curation-desk\/roster-feed/)).toHaveLength(0);
  });

  it("reads the post in the drawer, filled in from route 5 rather than left on the stub", async () => {
    const listRow = await row();
    fireEvent.click(listRow.getByLabelText("curation-desk.actions.read-key"));

    const drawer = within(await screen.findByRole("dialog"));
    await waitFor(() => expect(screen.getByTestId("renderer")).toBeInTheDocument());
    expect(state.entryFetch).toHaveBeenCalledWith("alice", "morning-light");
    // The list row carries no word count, community or reputation here: these
    // are on the drawer because route 5 answered, and it is the query the
    // drawer already makes for the recommender list, so it costs no second request.
    expect(drawer.getByText("curation-desk.row.words")).toBeInTheDocument();
    expect(drawer.getByText("Photography Lovers")).toBeInTheDocument();
    expect(router.callsTo(/curation-desk\/post\//)).toHaveLength(1);
  });

  it("opens the vote slider from the row, once the entry is there", async () => {
    const listRow = await row();
    fireEvent.click(listRow.getByLabelText("curation-desk.actions.vote"));
    await waitFor(() => expect(state.voteClicks).toEqual(["alice/morning-light"]));
  });

  /**
   * Reviewing a recommended post handles it, so it leaves the list at once,
   * the way it leaves an unreviewed-only queue: the mark's own cache update
   * judges the row by this list's filters.
   */
  it("marks the post by author and permlink, and the reviewed post leaves the list", async () => {
    router.on(/curation-desk\/mark$/, () => ({
      mark: { curator: "curator1", state: "reviewed", updated_at: new Date().toISOString() },
      row: { ...recoRow(), overlay: makeOverlay({ team_mark: "reviewed", team_mark_by: "curator1" }) },
    }));

    const listRow = await row();
    await waitFor(() => expect(listRow.getByLabelText("curation-desk.actions.reviewed")).not.toBeDisabled());
    fireEvent.click(listRow.getByLabelText("curation-desk.actions.reviewed"));

    await waitFor(() => expect(router.callsTo(/curation-desk\/mark$/)).toHaveLength(1));
    // The mark route never wanted a post_id: the pair addresses the post.
    expect(router.callsTo(/curation-desk\/mark$/)[0].body).toMatchObject({
      author: "alice",
      permlink: "morning-light",
      state: "reviewed",
    });
    await waitFor(() => expect(screen.queryByRole("toolbar")).toBeNull());
    expect(screen.getByText("curation-desk.reco-view.empty")).toBeInTheDocument();
  });

  it("keeps a pending vote with the post that asked for it", async () => {
    // Two rows, and the first post's entry never resolves: the drawer presses
    // the slider only once an entry is there, so a curator who moves on before
    // that must not have their vote land on the post they moved to.
    router.on(/curation-desk\/roster-feed/, () =>
      makeRosterPage([recoRow(), recoRow({ author: "bob", permlink: "second", title: "Second" }, 78)])
    );
    state.entryFetch.mockImplementation(async (author: string, permlink: string) => {
      if (author === "alice") return new Promise(() => {});
      return { author, permlink, body: "body", json_metadata: {}, active_votes: [] };
    });

    renderWithQueryClient(<CurationRecommendationsView />);
    await waitFor(() => expect(screen.getAllByRole("toolbar")).toHaveLength(2));
    const [first, second] = screen.getAllByRole("toolbar").map((el) => within(el));
    fireEvent.click(first.getByLabelText("curation-desk.actions.vote"));
    fireEvent.click(second.getByLabelText("curation-desk.actions.read-key"));

    await waitFor(() => expect(screen.getByTestId("renderer")).toBeInTheDocument());
    await waitFor(() => expect(state.entryFetch).toHaveBeenCalledWith("bob", "second"));
    expect(state.voteClicks).toEqual([]);
  });

  it("reads past the first page of marks, and stops at the payout window", async () => {
    // A page holds the 50 most recent marks. A curator who marks more than
    // that in a week would otherwise be told their own handled post is
    // untouched, and the Reviewed control would write over the mark.
    const recent = (n: number) => ({
      post_id: n,
      author: `other${n}`,
      permlink: `p${n}`,
      title: `Post ${n}`,
      created: new Date(Date.now() - HOUR).toISOString(),
      curator: "curator1",
      state: "reviewed",
      updated_at: new Date(Date.now() - HOUR).toISOString(),
    });
    router.on(/curation-desk\/marks$/, (_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (!body.cursor) {
        return { items: Array.from({ length: 50 }, (_, i) => recent(i)), next_cursor: "page-2" };
      }
      return {
        items: [
          { ...recent(99), author: "alice", permlink: "morning-light", state: "noted" },
          // Older than any open post, so the index is complete here even
          // though the route still offers another page.
          { ...recent(100), updated_at: new Date(Date.now() - 8 * DAY).toISOString() },
        ],
        next_cursor: "page-3",
      };
    });

    const listRow = await row();
    await waitFor(() => expect(listRow.getByLabelText("curation-desk.actions.clear-mark")).toBeInTheDocument());
    expect(listRow.getByText("curation-desk.mark-states.noted")).toBeInTheDocument();
    expect(router.callsTo(/curation-desk\/marks$/)).toHaveLength(2);
  });

  it("holds the Reviewed control while the marks index has not answered", async () => {
    router.on(/curation-desk\/marks$/, () => new Promise(() => {}));
    const listRow = await row();
    await waitFor(() => expect(listRow.getByLabelText("curation-desk.actions.snooze")).toBeInTheDocument());
    // Snooze, flag and note replace the curator's own mark by design, exactly
    // as they do in the queue; only this one would silently write over one.
    expect(listRow.getByLabelText("curation-desk.actions.reviewed")).toBeDisabled();
  });

  it("drops the vote and the recommendation once the window has scaled them away", async () => {
    // Two hours before payout: a vote keeps a sixth of its rshares and a
    // recommendation would point curators at a post they cannot earn on.
    router.on(/curation-desk\/roster-feed/, () =>
      makeRosterPage([recoRow({ created: new Date(Date.now() - (7 * DAY - 2 * HOUR)).toISOString() })])
    );
    const listRow = await row();
    await waitFor(() => expect(listRow.getByLabelText("curation-desk.actions.reviewed")).toBeInTheDocument());
    expect(listRow.queryByLabelText("curation-desk.actions.vote")).toBeNull();
    expect(listRow.queryByLabelText("curation-desk.recommend.aria")).toBeNull();
    // Reading it is still on offer: the desk never hides the post itself.
    expect(listRow.getByLabelText("curation-desk.actions.read-key")).toBeInTheDocument();
  });

  /**
   * A desk older than the recommender fields answers the roster view without
   * them. The row still renders, and Recommend is withheld: the viewer's own
   * recommendation cannot be told apart from none, so offering it could
   * broadcast a duplicate.
   */
  it("withholds Recommend on a row from a desk that sends no recommenders", async () => {
    router.on(/curation-desk\/roster-feed/, () => {
      const legacy: Record<string, unknown> = { ...recoRow() };
      delete legacy.recommenders;
      delete legacy.reasons;
      delete legacy.no_meta_count;
      return makeRosterPage([legacy as unknown as CurationRosterRow]);
    });
    const listRow = await row();
    await waitFor(() => expect(listRow.getByLabelText("curation-desk.actions.reviewed")).toBeInTheDocument());
    expect(listRow.getByLabelText("curation-desk.actions.vote")).toBeInTheDocument();
    expect(listRow.queryByLabelText("curation-desk.recommend.aria")).toBeNull();
    expect(listRow.queryByText("@curator2")).toBeNull();
  });

  it("offers Recommend on a curator's row once the recommenders are known", async () => {
    const listRow = await row();
    await waitFor(() => expect(listRow.getByLabelText("curation-desk.recommend.aria")).toBeInTheDocument());
  });

  /**
   * Dismissing a recommendation ends it, so the post leaves the list at once
   * through the dismissal's own cache update, not at the next refresh.
   */
  it("drops a dismissed post from the list at once", async () => {
    router.on(/curation-desk\/recommendation-dismiss/, () => ({
      row: { ...recoRow(), overlay: makeOverlay({ reco_dismissed_at: new Date().toISOString() }) },
    }));
    const listRow = await row();
    fireEvent.click(listRow.getByLabelText("curation-desk.reco.dismiss"));
    await waitFor(() => expect(router.callsTo(/curation-desk\/recommendation-dismiss/)).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("toolbar")).toBeNull());
  });

  /**
   * A colleague's mark and a trail vote are not in this tab's cache, so the
   * list reads again on an interval and a post handled elsewhere leaves it.
   */
  it("reads the curator list again, so a post handled elsewhere leaves it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await row();
      router.on(/curation-desk\/roster-feed/, () => makeRosterPage([]));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(61_000);
      });
      await waitFor(() => expect(screen.queryByRole("toolbar")).toBeNull());
      expect(router.callsTo(/curation-desk\/roster-feed/).length).toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * A reviewed post leaves a curator's list, so a drawer open on it would
   * close under the curator. It walks on to the next post instead, the way
   * the queue does.
   */
  it("walks the drawer on to the next post when the open post is reviewed", async () => {
    router
      .on(/curation-desk\/roster-feed/, () =>
        makeRosterPage([recoRow(), recoRow({ author: "bob", permlink: "second", title: "Second" }, 78)])
      )
      .on(/curation-desk\/mark$/, () => ({
        mark: { curator: "curator1", state: "reviewed", updated_at: new Date().toISOString() },
        row: { ...recoRow(), overlay: makeOverlay({ team_mark: "reviewed", team_mark_by: "curator1" }) },
      }));

    renderWithQueryClient(<CurationRecommendationsView />);
    await waitFor(() => expect(screen.getAllByRole("toolbar")).toHaveLength(2));
    const [first] = screen.getAllByRole("toolbar").map((el) => within(el));
    await waitFor(() => expect(first.getByLabelText("curation-desk.actions.reviewed")).not.toBeDisabled());
    fireEvent.click(first.getByLabelText("curation-desk.actions.read-key"));
    const drawer = within(await screen.findByRole("dialog"));
    await waitFor(() => expect(drawer.getByLabelText("curation-desk.actions.reviewed-key")).not.toBeDisabled());
    fireEvent.click(drawer.getByLabelText("curation-desk.actions.reviewed-key"));

    await waitFor(() => expect(router.callsTo(/curation-desk\/mark$/)).toHaveLength(1));
    await waitFor(() => expect(state.entryFetch).toHaveBeenCalledWith("bob", "second"));
    // The reviewed post is gone from the list and from the drawer, which stayed open.
    await waitFor(() => expect(screen.queryByText("Morning light")).toBeNull());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  /**
   * A post leaving mid-read would take the drawer, and a reply being written,
   * with it, so the list does not read again while a drawer is open.
   */
  it("does not read the curator list again while the drawer is open", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const listRow = await row();
      fireEvent.click(listRow.getByLabelText("curation-desk.actions.read-key"));
      await screen.findByRole("dialog");
      const before = router.callsTo(/curation-desk\/roster-feed/).length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(61_000);
      });
      expect(router.callsTo(/curation-desk\/roster-feed/)).toHaveLength(before);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * Dismissing the open post closes the drawer and the selection goes with it:
   * the list refresh waits for no open drawer, so a stale selection would keep
   * it paused for good.
   */
  it("keeps reading the curator list after the open post is dismissed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      router.on(/curation-desk\/recommendation-dismiss/, () => ({
        row: { ...recoRow(), overlay: makeOverlay({ reco_dismissed_at: new Date().toISOString() }) },
      }));
      const listRow = await row();
      fireEvent.click(listRow.getByLabelText("curation-desk.actions.read-key"));
      await screen.findByRole("dialog");
      fireEvent.click(listRow.getByLabelText("curation-desk.reco.dismiss"));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      const before = router.callsTo(/curation-desk\/roster-feed/).length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(61_000);
      });
      await waitFor(() => expect(router.callsTo(/curation-desk\/roster-feed/).length).toBeGreaterThan(before));
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * A refresh can already be on its way when the curator opens a post. When its
   * answer no longer holds that post, the drawer, and any reply being written,
   * stays on it instead of unmounting.
   */
  it("keeps the open post in the drawer when a refresh already running drops it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const listRow = await row();
      let answer: (page: unknown) => void = () => undefined;
      router.on(
        /curation-desk\/roster-feed/,
        () =>
          new Promise((resolve) => {
            answer = resolve;
          })
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(61_000);
      });
      await waitFor(() => expect(router.callsTo(/curation-desk\/roster-feed/)).toHaveLength(2));

      fireEvent.click(listRow.getByLabelText("curation-desk.actions.read-key"));
      await waitFor(() => expect(screen.getByTestId("renderer")).toBeInTheDocument());
      await act(async () => {
        answer(makeRosterPage([]));
      });
      await waitFor(() => expect(screen.getByText("curation-desk.reco-view.empty")).toBeInTheDocument());
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByTestId("renderer")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * A failed mark puts the curator back on the post only while the drawer
   * still sits where the automatic advance left it.
   */
  it("leaves a closed drawer closed when a mark fails after the curator moved on", async () => {
    let failMark: () => void = () => undefined;
    router
      .on(/curation-desk\/roster-feed/, () =>
        makeRosterPage([recoRow(), recoRow({ author: "bob", permlink: "second", title: "Second" }, 78)])
      )
      .on(
        /curation-desk\/mark$/,
        () =>
          new Promise((_resolve, reject) => {
            failMark = () => reject(new Error("offline"));
          })
      );

    renderWithQueryClient(<CurationRecommendationsView />);
    await waitFor(() => expect(screen.getAllByRole("toolbar")).toHaveLength(2));
    const [first] = screen.getAllByRole("toolbar").map((el) => within(el));
    await waitFor(() => expect(first.getByLabelText("curation-desk.actions.reviewed")).not.toBeDisabled());
    fireEvent.click(first.getByLabelText("curation-desk.actions.read-key"));
    const drawer = within(await screen.findByRole("dialog"));
    await waitFor(() => expect(drawer.getByLabelText("curation-desk.actions.reviewed-key")).not.toBeDisabled());
    fireEvent.click(drawer.getByLabelText("curation-desk.actions.reviewed-key"));
    await waitFor(() => expect(state.entryFetch).toHaveBeenCalledWith("bob", "second"));
    await waitFor(() => expect(router.callsTo(/curation-desk\/mark$/)).toHaveLength(1));

    fireEvent.click(within(screen.getByRole("dialog")).getByLabelText("g.close"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await act(async () => {
      failMark();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("drops them for a paid post too, which the shared clock can reach with the tab open", async () => {
    router.on(/curation-desk\/roster-feed/, () =>
      makeRosterPage([recoRow({ created: new Date(Date.now() - 8 * DAY).toISOString() })])
    );
    const listRow = await row();
    await waitFor(() => expect(listRow.getByLabelText("curation-desk.actions.reviewed")).toBeInTheDocument());
    expect(listRow.queryByLabelText("curation-desk.actions.vote")).toBeNull();
    expect(listRow.queryByLabelText("curation-desk.recommend.aria")).toBeNull();
  });
});

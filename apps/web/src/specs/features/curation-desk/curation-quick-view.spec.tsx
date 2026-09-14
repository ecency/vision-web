import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { renderWithQueryClient } from "@/specs/test-utils";
import { installFetchRouter, makePost, makeRoster, makeRow, NOW } from "./curation-test-utils";

const state = vi.hoisted(() => ({
  username: "member1" as string | undefined,
  entryFetch: vi.fn(),
  rendererProps: [] as Array<Record<string, unknown>>,
  voteClicks: [] as number[],
  tipOpens: [] as string[],
  toggleUiProp: vi.fn(),
  replies: [] as Array<Record<string, unknown>>,
  // The reply mutation's callbacks, so a test can settle or fail the broadcast.
  replyCallbacks: { onSuccess: undefined as (() => void) | undefined, onError: undefined as ((text: string, err: unknown) => void) | undefined },
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
  useGlobalStore: (selector: (s: unknown) => unknown) => selector({ toggleUiProp: state.toggleUiProp, activeUser: state.username ? { username: state.username } : null }),
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
vi.mock("@/features/shared/entry-tip-btn", () => ({
  EntryTipBtn: ({ entry, trigger }: { entry: { author: string; permlink: string }; trigger: (open: () => void) => React.ReactNode }) => (
    <>{trigger(() => state.tipOpens.push(`${entry.author}/${entry.permlink}`))}</>
  ),
}));
// The editor is the post page's; here a textarea and the two buttons stand in.
vi.mock("@/features/shared/comment", () => ({
  Comment: ({ onSubmit, onCancel, initialText, inProgress }: { onSubmit: (t: string) => Promise<unknown>; onCancel?: () => void; initialText?: string | null; inProgress?: boolean }) => (
    <div data-testid="comment-box" data-initial={initialText ?? ""} data-busy={inProgress ? "1" : "0"}>
      <textarea aria-label="reply" defaultValue={initialText ?? ""} />
      <button type="button" onClick={() => void onSubmit((document.querySelector('[aria-label="reply"]') as HTMLTextAreaElement).value)}>g.reply</button>
      <button type="button" onClick={onCancel}>g.cancel</button>
    </div>
  ),
}));
vi.mock("@/api/mutations", () => ({
  useCreateReply: (_entry: unknown, _root: unknown, onSuccess?: () => void, onError?: (text: string, err: unknown) => void) => {
    state.replyCallbacks.onSuccess = onSuccess;
    state.replyCallbacks.onError = onError;
    return {
      mutateAsync: vi.fn(async (vars: Record<string, unknown>) => {
        state.replies.push(vars);
        onSuccess?.();
        return {};
      }),
    };
  },
}));
vi.mock("@/features/shared/user-avatar", () => ({ UserAvatar: () => <span /> }));
vi.mock("@/features/shared/feedback", () => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/api/format-error", () => ({ formatError: (e: unknown) => [String(e), "common"] }));
// The real drawer mounts its surface a frame after `show` flips; a stub that
// mounted at once hid the case where the entry is already cached and the
// buttons are not there yet on the first render.
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
vi.mock("@/api/sdk-mutations/use-curation-recommend-mutation", () => ({
  useCurationRecommendMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { CurationQuickView } from "@/features/curation-desk/curation-quick-view";
import type { ViewerRole } from "@/features/curation-desk/types";

const member: ViewerRole = { username: "member1", kind: "member", role: null, isRoster: false, isTrial: false, isLoading: false };
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
    // Fixture ages are offsets from NOW; the drawer reads the real clock, so the
    // post drifts into its paid window once wall time passes NOW + 7 d.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
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
    state.tipOpens.length = 0;
    state.replies.length = 0;
    state.toggleUiProp.mockReset();
    router = installFetchRouter()
      .on(/curation-desk\/roster$/, () => makeRoster())
      .on(/curation-desk\/post\//, () => makePost(row));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("offers exactly one link out to the post, in the action bar", async () => {
    renderDrawer({ row });
    await screen.findByTestId("renderer");
    const links = screen
      .getAllByRole("link")
      .filter((el) => el.getAttribute("href") === "/@alice/morning-light");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent("curation-desk.actions.open");
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

  // `row.rshares_total && ...` renders the number 0 as a text child, so a post
  // with no rshares yet printed a stray "0" into the rewards list.
  it("never prints a bare zero into the rewards list", async () => {
    renderDrawer({ row: { ...row, rshares_total: 0, rshares_after_24h: 0 } });
    await screen.findByTestId("renderer");
    const rewards = screen.getByText("curation-desk.quick-view.rewards").parentElement!.querySelector("ul")!;
    expect(rewards.textContent).not.toContain("0");
    expect(screen.queryByText("curation-desk.quick-view.late-rshares")).toBeNull();
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

  it("toggles the reply box from the Comment button and posts the reply under the post", async () => {
    renderDrawer({ row });
    await screen.findByTestId("renderer");
    expect(screen.queryByTestId("comment-box")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "curation-desk.actions.comment-key" }));
    expect(screen.getByTestId("comment-box")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("reply"), { target: { value: "Lovely light in the third shot." } });
    fireEvent.click(screen.getByRole("button", { name: "g.reply" }));
    await waitFor(() => expect(state.replies).toHaveLength(1));
    const vars = state.replies[0];
    expect(vars.text).toBe("Lovely light in the third shot.");
    expect(vars.point).toBe(true);
    expect(String(vars.permlink)).toMatch(/^re-alice-/);
    expect((vars.jsonMeta as { tags: string[] }).tags).toEqual(["ecency"]);
    // The reply is optimistic, so the box closes on submit.
    await waitFor(() => expect(screen.queryByTestId("comment-box")).toBeNull());
  });

  it("asks a signed-out reader to sign in instead of opening an empty reply box", async () => {
    state.username = undefined;
    renderDrawer({ row, viewer: { ...member, username: "", kind: "anon" } });
    await screen.findByTestId("renderer");
    fireEvent.click(screen.getByRole("button", { name: "curation-desk.actions.comment-key" }));
    expect(state.toggleUiProp).toHaveBeenCalledWith("login");
    expect(screen.queryByTestId("comment-box")).toBeNull();

    // The c key goes through the same button, so it prompts too.
    state.toggleUiProp.mockReset();
    const onCommentHandled = vi.fn();
    renderDrawer({ row: next, viewer: { ...member, username: "", kind: "anon" }, commentOnOpen: true, onCommentHandled });
    await waitFor(() => expect(onCommentHandled).toHaveBeenCalledTimes(1));
    expect(state.toggleUiProp).toHaveBeenCalledWith("login");
    expect(screen.queryByTestId("comment-box")).toBeNull();
  });

  it("reopens the reply box with the text kept when the broadcast fails later", async () => {
    renderDrawer({ row });
    await screen.findByTestId("renderer");
    fireEvent.click(screen.getByRole("button", { name: "curation-desk.actions.comment-key" }));
    fireEvent.change(screen.getByLabelText("reply"), { target: { value: "kept text" } });
    fireEvent.click(screen.getByRole("button", { name: "g.reply" }));
    await waitFor(() => expect(screen.queryByTestId("comment-box")).toBeNull());

    act(() => state.replyCallbacks.onError?.("kept text", new Error("rc")));
    expect(screen.getByTestId("comment-box")).toHaveAttribute("data-initial", "kept text");
    // The text is also back in the editor's own draft, so a failure that lands
    // after the curator moved to another post is waiting when they return.
    expect(window.localStorage.getItem("ecency_reply_text_alice_morning-light")).toBe(JSON.stringify("kept text"));

    fireEvent.click(screen.getByRole("button", { name: "g.cancel" }));
    expect(screen.queryByTestId("comment-box")).toBeNull();
  });

  it("opens the reply box for the c key once the entry arrives, then hands the flag back", async () => {
    const onCommentHandled = vi.fn();
    let resolveEntry: ((value: unknown) => void) | undefined;
    state.entryFetch.mockImplementation(
      (author: string, permlink: string) =>
        new Promise((resolve) => {
          resolveEntry = () => resolve({ author, permlink, body: "slow body", json_metadata: {}, active_votes: [] });
        })
    );
    renderDrawer({ row, commentOnOpen: true, onCommentHandled });
    await act(async () => {});
    expect(screen.queryByTestId("comment-box")).toBeNull();
    expect(onCommentHandled).not.toHaveBeenCalled();

    await act(async () => {
      resolveEntry?.(undefined);
    });
    expect(await screen.findByTestId("comment-box")).toBeInTheDocument();
    expect(onCommentHandled).toHaveBeenCalledTimes(1);
  });

  it("presses c, p and v once the drawer's buttons are there, with an entry that is already cached", async () => {
    const onCommentHandled = vi.fn();
    const onTipHandled = vi.fn();
    const onVoteHandled = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData(["posts", "entry", "/@alice/morning-light"], {
      author: "alice",
      permlink: "morning-light",
      body: "cached body",
      json_metadata: {},
      active_votes: [],
    });
    renderWithQueryClient(
      <CurationQuickView row={row} neighbour={null} viewer={member} recommendationsEnabled commentOnOpen tipOnOpen voteOnOpen onCommentHandled={onCommentHandled} onTipHandled={onTipHandled} onVoteHandled={onVoteHandled} onClose={noop} onPrev={noop} onNext={noop} onReviewed={noop} onSnooze={noop} onFlag={noop} onNote={noop} onSaveNote={noop} recommendRef={null} />,
      { queryClient: client }
    );
    expect(state.entryFetch).not.toHaveBeenCalled();
    expect(await screen.findByTestId("comment-box")).toBeInTheDocument();
    await waitFor(() => expect(state.tipOpens).toEqual(["alice/morning-light"]));
    await waitFor(() => expect(state.voteClicks).toHaveLength(1));
    expect(onCommentHandled).toHaveBeenCalledTimes(1);
    expect(onTipHandled).toHaveBeenCalledTimes(1);
    expect(onVoteHandled).toHaveBeenCalledTimes(1);
  });

  it("sends Points to the author from the Points button and from the p key", async () => {
    const onTipHandled = vi.fn();
    renderDrawer({ row });
    fireEvent.click(await screen.findByRole("button", { name: "curation-desk.actions.points-key" }));
    expect(state.tipOpens).toEqual(["alice/morning-light"]);

    renderDrawer({ row: next, tipOnOpen: true, onTipHandled });
    await waitFor(() => expect(state.tipOpens).toEqual(["alice/morning-light", "bob/second"]));
    expect(onTipHandled).toHaveBeenCalledTimes(1);
  });

  it("never renders the previous post's open reply box on a cached next post, not even for a frame", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    for (const r of [row, next]) {
      client.setQueryData(["posts", "entry", `/@${r.author}/${r.permlink}`], { author: r.author, permlink: r.permlink, body: "cached", json_metadata: {}, active_votes: [] });
    }
    const boxes: string[] = [];
    const observer = new MutationObserver(() => {
      for (const box of document.querySelectorAll("[data-curation-reply]")) boxes.push(box.closest("[data-curation-drawer]")?.querySelector("h2")?.textContent ?? "?");
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const { rerender } = renderWithQueryClient(
      <CurationQuickView row={row} neighbour={null} viewer={member} recommendationsEnabled onClose={noop} onPrev={noop} onNext={noop} onReviewed={noop} onSnooze={noop} onFlag={noop} onNote={noop} onSaveNote={noop} recommendRef={null} />,
      { queryClient: client }
    );
    fireEvent.click(await screen.findByRole("button", { name: "curation-desk.actions.comment-key" }));
    expect(screen.getByTestId("comment-box")).toBeInTheDocument();
    rerender(
      <CurationQuickView row={next} neighbour={null} viewer={member} recommendationsEnabled onClose={noop} onPrev={noop} onNext={noop} onReviewed={noop} onSnooze={noop} onFlag={noop} onNote={noop} onSaveNote={noop} recommendRef={null} />
    );
    await screen.findByText("Post 2");
    expect(screen.queryByTestId("comment-box")).toBeNull();
    observer.disconnect();
    expect(boxes.filter((title) => title === "Post 2")).toEqual([]);
  });

  /**
   * Curators reported that on a phone they could find neither control once a
   * post was open: both were glyphs, next was a chevron next to the close
   * button in a cramped header, and reviewed sat in a wrapped row of seven
   * small icons. Both are worded now, and both sit in the drawer's own bar.
   */
  it("puts a worded Reviewed and Next in the drawer's action bar", async () => {
    const onReviewed = vi.fn();
    const onNext = vi.fn();
    renderDrawer({ row, viewer: roster, onReviewed, onNext });

    const reviewed = await screen.findByRole("button", { name: "curation-desk.actions.reviewed-key" });
    const next = screen.getByRole("button", { name: "curation-desk.actions.next-key" });
    expect(reviewed).toHaveTextContent("curation-desk.actions.reviewed");
    expect(next).toHaveTextContent("curation-desk.actions.next");

    fireEvent.click(reviewed);
    expect(onReviewed).toHaveBeenCalledWith(row);
    fireEvent.click(next);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("keeps Next for a reader who is not on the roster, and marks nothing", async () => {
    const onNext = vi.fn();
    renderDrawer({ row, onNext });
    fireEvent.click(await screen.findByRole("button", { name: "curation-desk.actions.next-key" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "curation-desk.actions.reviewed-key" })).toBeNull();
  });

  /**
   * The other half of the hold in curation-queue-view: the queue view cannot
   * ask the drawer anything once the row is gone, because React unmounts the
   * drawer in the very render that drops it. The drawer reports into this ref
   * as it goes, and must NOT clear it on unmount.
   */
  it("reports which post its reply box is open for, and leaves the answer behind when it unmounts", async () => {
    const replyOpenFor = { current: null as string | null };
    const { rerender } = renderWithQueryClient(
      <CurationQuickView row={row} neighbour={null} viewer={member} recommendationsEnabled replyOpenFor={replyOpenFor} onClose={noop} onPrev={noop} onNext={noop} onReviewed={noop} onSnooze={noop} onFlag={noop} onNote={noop} onSaveNote={noop} recommendRef={null} />
    );
    await screen.findByTestId("renderer");
    expect(replyOpenFor.current).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "curation-desk.actions.comment-key" }));
    expect(screen.getByTestId("comment-box")).toBeInTheDocument();
    await waitFor(() => expect(replyOpenFor.current).toBe("alice/morning-light"));

    // The row leaving the queue renders the drawer with no row at all, which is
    // how it disappears in production. The answer has to survive that.
    rerender(
      <CurationQuickView row={null} neighbour={null} viewer={member} recommendationsEnabled replyOpenFor={replyOpenFor} onClose={noop} onPrev={noop} onNext={noop} onReviewed={noop} onSnooze={noop} onFlag={noop} onNote={noop} onSaveNote={noop} recommendRef={null} />
    );
    expect(screen.queryByTestId("comment-box")).toBeNull();
    expect(replyOpenFor.current).toBe("alice/morning-light");
  });

  it("clears its answer when the box is closed for that same post", async () => {
    const replyOpenFor = { current: null as string | null };
    renderWithQueryClient(
      <CurationQuickView row={row} neighbour={null} viewer={member} recommendationsEnabled replyOpenFor={replyOpenFor} onClose={noop} onPrev={noop} onNext={noop} onReviewed={noop} onSnooze={noop} onFlag={noop} onNote={noop} onSaveNote={noop} recommendRef={null} />
    );
    await screen.findByTestId("renderer");
    const toggle = screen.getByRole("button", { name: "curation-desk.actions.comment-key" });
    fireEvent.click(toggle);
    await waitFor(() => expect(replyOpenFor.current).toBe("alice/morning-light"));
    fireEvent.click(toggle);
    await waitFor(() => expect(replyOpenFor.current).toBeNull());
  });

  it("closes the reply box when the drawer moves to another post", async () => {
    const { rerender } = renderDrawer({ row });
    await screen.findByTestId("renderer");
    fireEvent.click(screen.getByRole("button", { name: "curation-desk.actions.comment-key" }));
    expect(screen.getByTestId("comment-box")).toBeInTheDocument();
    rerender(
      <CurationQuickView row={next} neighbour={null} viewer={member} recommendationsEnabled onClose={noop} onPrev={noop} onNext={noop} onReviewed={noop} onSnooze={noop} onFlag={noop} onNote={noop} onSaveNote={noop} recommendRef={null} />
    );
    await screen.findByTestId("renderer");
    expect(screen.queryByTestId("comment-box")).toBeNull();
  });
});

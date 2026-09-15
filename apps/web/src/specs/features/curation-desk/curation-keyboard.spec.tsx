import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";
import { installFetchRouter, iso, jsonResponse, makeFeedPage, makeOverlay, makeRoster, makeRosterPage, makeRow, makeStatus, NOW } from "./curation-test-utils";

// Hoisted: the vi.mock factory below runs before module-level bindings exist.
const reply = vi.hoisted(() => ({ openFor: null as string | null }));
const drawerRenders = vi.hoisted(() => [] as Array<{ post_id: number; comment: boolean; tip: boolean }>);
const state = vi.hoisted(() => ({ username: undefined as string | undefined }));

vi.mock("@ecency/sdk", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")) }));
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
vi.mock("@/config", () => ({
  EcencyConfigManager: {
    useConfig: (cond: (c: unknown) => unknown) => cond({ visionFeatures: { curationDesk: { enabled: true, recommendations: { enabled: true } } } }),
  },
}));
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<unknown>) => {
    const Lazy = React.lazy(async () => {
      const m = (await loader()) as Record<string, unknown>;
      // A forwardRef component is an object with $$typeof, not a function.
      const component = m && typeof m === "object" && !("$$typeof" in m) && "default" in m ? m.default : m;
      return { default: component as React.ComponentType };
    });
    return React.forwardRef(function DynamicStub(props: Record<string, unknown>, ref) {
      return (
        <React.Suspense fallback={null}>
          <Lazy {...props} ref={ref} />
        </React.Suspense>
      );
    });
  },
}));
vi.mock("react-virtuoso", () => ({
  Virtuoso: React.forwardRef(function VirtuosoStub(props: { data: unknown[]; itemContent: (i: number, item: unknown) => React.ReactNode }, ref) {
    React.useImperativeHandle(ref, () => ({ scrollIntoView: vi.fn(), scrollToIndex: vi.fn() }));
    return <div>{props.data.map((item, i) => <React.Fragment key={i}>{props.itemContent(i, item)}</React.Fragment>)}</div>;
  }),
}));
vi.mock("@/features/curation-desk/curation-quick-view", () => ({
  CurationQuickView: ({ row, commentOnOpen, tipOnOpen, replyOpenFor, onReviewed, onSnooze }: { row: { post_id: number; author: string; permlink: string } | null; commentOnOpen?: boolean; tipOnOpen?: boolean; replyOpenFor?: { current: string | null }; onReviewed?: (row: never) => void; onSnooze?: (row: never) => void }) => {
    if (row) drawerRenders.push({ post_id: row.post_id, comment: !!commentOnOpen, tip: !!tipOnOpen });
    // The real drawer reports an open reply box into this ref and never clears
    // it on unmount; `reply.openFor` is the test's stand-in for the curator
    // having pressed Comment.
    React.useEffect(() => {
      if (!replyOpenFor || !row) return;
      const key = `${row.author}/${row.permlink}`;
      if (reply.openFor === key) replyOpenFor.current = key;
      else if (replyOpenFor.current === key) replyOpenFor.current = null;
    });
    return row ? (
      <div data-testid="quick-view-open" data-comment={String(!!commentOnOpen)} data-tip={String(!!tipOnOpen)}>
        {row.post_id}
        <button type="button" aria-label="drawer-reviewed" onClick={() => onReviewed?.(row as never)} />
        <button type="button" aria-label="drawer-snooze" onClick={() => onSnooze?.(row as never)} />
      </div>
    ) : null;
  },
}));
vi.mock("@/features/shared/profile-popover", () => ({ ProfilePopover: ({ entry }: { entry: { author: string } }) => <span>@{entry.author}</span> }));
vi.mock("@/features/shared/user-avatar", () => ({ UserAvatar: () => <span /> }));
vi.mock("@/features/shared/feedback", () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/api/format-error", () => ({ formatError: (e: unknown) => [String(e), "common"] }));
vi.mock("@/api/sdk-mutations/use-curation-recommend-mutation", () => ({
  useCurationRecommendMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { CurationQueueView } from "@/features/curation-desk/curation-queue-view";
import { info as infoToast } from "@/features/shared/feedback";
import { isKeyboardInert, keyToAction, useCurationKeyboard, type CurationKeyHandlers } from "@/features/curation-desk/curation-keyboard";

function press(key: string, options: Partial<KeyboardEventInit> = {}, target: Element | Document = document) {
  fireEvent.keyDown(target, { key, ...options });
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnMount: false, staleTime: 60_000 } } });
}

describe("keyboard map", () => {
  it("lets Enter activate an expandable panel without opening the quick view", () => {
    const summary = document.createElement("summary");
    const label = document.createElement("span");
    summary.appendChild(label);
    expect(isKeyboardInert({ target: label, key: "Enter", ctrlKey: false, metaKey: false, altKey: false })).toBe(true);
  });
  it("maps every documented key", () => {
    expect(keyToAction({ key: "j", shiftKey: false })).toBe("next");
    expect(keyToAction({ key: "k", shiftKey: false })).toBe("prev");
    expect(keyToAction({ key: "Enter", shiftKey: false })).toBe("toggleQuickView");
    expect(keyToAction({ key: "o", shiftKey: false })).toBe("toggleQuickView");
    expect(keyToAction({ key: "v", shiftKey: false })).toBe("vote");
    expect(keyToAction({ key: "c", shiftKey: false })).toBe("comment");
    expect(keyToAction({ key: "p", shiftKey: false })).toBe("tip");
    expect(keyToAction({ key: "r", shiftKey: false })).toBe("reviewed");
    // Shift+R was the team cursor. Retired, and not rebound: curator muscle
    // memory would fire the new binding for a while.
    expect(keyToAction({ key: "R", shiftKey: true })).toBeNull();
    expect(keyToAction({ key: "s", shiftKey: false })).toBe("skip");
    expect(keyToAction({ key: "ArrowRight", shiftKey: false })).toBe("skip");
    expect(keyToAction({ key: "z", shiftKey: false })).toBe("snooze");
    expect(keyToAction({ key: "f", shiftKey: false })).toBe("flag");
    expect(keyToAction({ key: "n", shiftKey: false })).toBe("note");
    expect(keyToAction({ key: "x", shiftKey: false })).toBe("recommend");
    expect(keyToAction({ key: "O", shiftKey: true })).toBe("openExternal");
    expect(keyToAction({ key: "?", shiftKey: true })).toBe("help");
    expect(keyToAction({ key: "q", shiftKey: false })).toBeNull();
  });

  it("is inert inside editable targets, with an open modal, an open vote slider or a chord", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    expect(isKeyboardInert({ target: input, ctrlKey: false, metaKey: false, altKey: false })).toBe(true);
    expect(isKeyboardInert({ target: document.body, ctrlKey: true, metaKey: false, altKey: false })).toBe(true);
    expect(isKeyboardInert({ target: document.body, ctrlKey: false, metaKey: false, altKey: false })).toBe(false);

    const slider = document.createElement("div");
    slider.className = "entry-vote-btn";
    slider.setAttribute("aria-expanded", "true");
    document.body.appendChild(slider);
    expect(isKeyboardInert({ target: document.body, ctrlKey: false, metaKey: false, altKey: false })).toBe(true);
    slider.remove();

    // Modal portals a backdrop AND a content wrapper, in that order.
    const modal = document.createElement("div");
    modal.id = "modal-dialog-container";
    const backdrop = document.createElement("div");
    const wrapper = document.createElement("div");
    const content = document.createElement("div");
    wrapper.appendChild(content);
    modal.append(backdrop, wrapper);
    document.body.appendChild(modal);
    expect(isKeyboardInert({ target: document.body, ctrlKey: false, metaKey: false, altKey: false })).toBe(true);

    // The desk's own drawer is the one modal that keeps the keys alive, and
    // the empty backdrop beside it must not count as a foreign modal.
    content.setAttribute("data-curation-drawer", "");
    expect(isKeyboardInert({ target: document.body, ctrlKey: false, metaKey: false, altKey: false })).toBe(false);

    // A second, foreign dialog over the drawer makes the keys inert again.
    const other = document.createElement("div");
    other.appendChild(document.createElement("div"));
    modal.appendChild(other);
    expect(isKeyboardInert({ target: document.body, ctrlKey: false, metaKey: false, altKey: false })).toBe(true);
    modal.remove();
    input.remove();
  });

  it("lets a letter key through on a focused row action but not Enter", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    // Enter activates the button natively; the desk must not also toggle the
    // drawer. j and k stay alive so navigation survives a row action.
    expect(isKeyboardInert({ target: button, key: "Enter", ctrlKey: false, metaKey: false, altKey: false })).toBe(true);
    expect(isKeyboardInert({ target: button, key: "j", ctrlKey: false, metaKey: false, altKey: false })).toBe(false);
    button.remove();
  });
});

describe("useCurationKeyboard", () => {
  it("calls the handler for a key and nothing while typing", () => {
    const handlers = Object.fromEntries(
      ["next", "prev", "toggleQuickView", "vote", "comment", "tip", "reviewed", "skip", "snooze", "flag", "note", "recommend", "openExternal", "help"].map((k) => [k, vi.fn()])
    ) as unknown as CurationKeyHandlers;
    renderHook(() => useCurationKeyboard(handlers, true));
    press("j");
    expect(handlers.next).toHaveBeenCalledTimes(1);
    const input = document.createElement("textarea");
    document.body.appendChild(input);
    press("j", {}, input);
    expect(handlers.next).toHaveBeenCalledTimes(1);
    input.remove();
  });
});

describe("keyboard on the queue", () => {
  let router: ReturnType<typeof installFetchRouter>;

  beforeEach(() => {
    // Fixture ages are offsets from NOW; the desk reads the real clock, so the
    // rows drift out of their window once wall time passes NOW + 24 h.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    state.username = undefined;
    reply.openFor = null;
    window.localStorage.clear();
    router = installFetchRouter()
      .on(/curation-desk\/status/, () => makeStatus())
      .on(/curation-desk\/roster$/, () => makeRoster())
      .on(/curation-desk\/feed/, () => makeFeedPage([makeRow({ post_id: 1 }), makeRow({ post_id: 2 }), makeRow({ post_id: 3 })]))
      .on(/curation-desk\/roster-feed/, () => makeRosterPage([makeRow({ post_id: 11, overlay: makeOverlay() }), makeRow({ post_id: 12, overlay: makeOverlay() })]))
      .on(/curation-desk\/mark$/, (_url, init) => ({ mark: null, row: { ...makeRow({ post_id: Number(JSON.parse(String(init?.body)).permlink.split("-")[1]) }), overlay: makeOverlay({ team_mark: "reviewed", team_mark_by: "curator1" }) } }))
      .on(/curation-desk\/tick/, () => ({ overlay: [], deltas: { marks: [], flags: [], signals: [] }, team_cursor: { post_id: null, created: null }, active_curators: [], trail_alerts: [], generated_at: "x", truncated: false }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    // Vitest isolates per file, not per test, and the refine filters now
    // persist: without this a filter set in one case narrows the next one.
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("j and k move aria-current across rows", async () => {
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    const articles = await screen.findAllByRole("article");
    expect(articles).toHaveLength(3);
    await act(async () => press("j"));
    expect(screen.getAllByRole("article")[0]).toHaveAttribute("aria-current", "true");
    await act(async () => press("j"));
    expect(screen.getAllByRole("article")[1]).toHaveAttribute("aria-current", "true");
    expect(screen.getAllByRole("article")[0]).not.toHaveAttribute("aria-current");
    await act(async () => press("k"));
    expect(screen.getAllByRole("article")[0]).toHaveAttribute("aria-current", "true");
  });

  it("opens the selected post without a category prefix with Shift+O", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    try {
      renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
      await screen.findAllByRole("article");
      await act(async () => press("j"));
      await act(async () => press("O", { shiftKey: true }));
      expect(open).toHaveBeenCalledWith("/@author1/post-1", "_blank", "noopener");
    } finally {
      open.mockRestore();
    }
  });

  it("ignores keys typed into an input and while a vote slider is open", async () => {
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    await screen.findAllByRole("article");
    const input = document.createElement("input");
    document.body.appendChild(input);
    await act(async () => press("j", {}, input));
    expect(screen.queryAllByRole("article").some((a) => a.getAttribute("aria-current") === "true")).toBe(false);
    input.remove();

    const slider = document.createElement("div");
    slider.className = "entry-vote-btn";
    slider.setAttribute("aria-expanded", "true");
    document.body.appendChild(slider);
    await act(async () => press("j"));
    expect(screen.queryAllByRole("article").some((a) => a.getAttribute("aria-current") === "true")).toBe(false);
    slider.remove();
  });

  it("r marks reviewed for a roster user and is a no-op for a member", async () => {
    state.username = "curator1";
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    await screen.findAllByRole("article");
    await act(async () => press("j"));
    await act(async () => press("r"));
    await waitFor(() => expect(router.callsTo(/curation-desk\/mark$/)).toHaveLength(1));
    const body = router.callsTo(/curation-desk\/mark$/)[0].body as Record<string, unknown>;
    expect(body).toMatchObject({ state: "reviewed", code: "code-1" });
    // The mark carries the lane this desk is showing, so the team hand-off can
    // say which queue the position was earned in. The roster default is the
    // whole queue in queue order with handled rows hidden.
    expect(body.lane).toMatchObject({ sort: "queue", app: "all", hide_reviewed: true, hide_snoozed: true });
  });

  it("r takes the reviewed row out of the queue, keeps the selection on the next row and undo puts it back", async () => {
    state.username = "curator1";
    router.on(/curation-desk\/mark-clear$/, (_url, init) => ({
      mark: null,
      row: { ...makeRow({ post_id: Number(JSON.parse(String(init?.body)).permlink.split("-")[1]) }), overlay: makeOverlay() },
    }));
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    expect(await screen.findAllByRole("article")).toHaveLength(2);
    await act(async () => press("j"));
    expect(document.getElementById("curation-row-title-11")?.closest("article")).toHaveAttribute("aria-current", "true");

    await act(async () => press("r"));
    // Reviewed means done for the whole team: the row leaves the unreviewed
    // queue at once, and the next post is the selected one, not the top.
    await waitFor(() => expect(document.getElementById("curation-row-title-11")).toBeNull());
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(document.getElementById("curation-row-title-12")?.closest("article")).toHaveAttribute("aria-current", "true");

    fireEvent.click(await screen.findByLabelText("curation-desk.live.undo"));
    await waitFor(() => expect(router.callsTo(/curation-desk\/mark-clear$/)).toHaveLength(1));
    // Back in its place, ahead of the row that had followed it.
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
    expect(document.getElementById("curation-row-title-11")?.closest("article")).toBe(screen.getAllByRole("article")[0]);
  });

  it("moves the selection to the row that took the place of one a colleague reviewed", async () => {
    state.username = "curator1";
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    expect(await screen.findAllByRole("article")).toHaveLength(2);
    await act(async () => press("j"));
    expect(document.getElementById("curation-row-title-11")?.closest("article")).toHaveAttribute("aria-current", "true");

    router.on(/curation-desk\/tick/, () => ({
      overlay: [],
      deltas: { marks: [{ post_id: 11, curator: "riyat", state: "reviewed", updated_at: "2026-09-05T12:00:10" }], flags: [], signals: [] },
      team_cursor: { post_id: null, created: null },
      active_curators: [],
      trail_alerts: [],
      generated_at: "y",
      truncated: false,
    }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    await waitFor(() => expect(document.getElementById("curation-row-title-11")).toBeNull());
    expect(document.getElementById("curation-row-title-12")?.closest("article")).toHaveAttribute("aria-current", "true");
    // j from there walks on (nothing below), never back to the top.
    await act(async () => press("j"));
    expect(document.getElementById("curation-row-title-12")?.closest("article")).toHaveAttribute("aria-current", "true");
  });

  function tickReviewing(...ids: number[]) {
    return () => ({
      overlay: [],
      deltas: { marks: ids.map((post_id) => ({ post_id, curator: "riyat", state: "reviewed", updated_at: "2026-09-05T12:00:10" })), flags: [], signals: [] },
      team_cursor: { post_id: null, created: null },
      active_curators: [],
      trail_alerts: [],
      generated_at: "y",
      truncated: false,
    });
  }

  it("closes a drawer open on a post a colleague took, with a word, instead of swapping the post", async () => {
    state.username = "curator1";
    vi.mocked(infoToast).mockClear();
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    expect(await screen.findAllByRole("article")).toHaveLength(2);
    await act(async () => press("j"));
    await act(async () => press("Enter"));
    expect(screen.getByTestId("quick-view-open")).toHaveTextContent("11");

    router.on(/curation-desk\/tick/, tickReviewing(11));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    await waitFor(() => expect(document.getElementById("curation-row-title-11")).toBeNull());
    // Never post 12 in the drawer: the curator did not open it.
    expect(screen.queryByTestId("quick-view-open")).toBeNull();
    expect(infoToast).toHaveBeenCalledWith("curation-desk.live.left-queue");
    // The selection still moved on, so the keys keep working from there.
    expect(document.getElementById("curation-row-title-12")?.closest("article")).toHaveAttribute("aria-current", "true");
  });

  /**
   * The desk opens oldest first under 24 h, so the post at the top is the one
   * about to cross the window's edge, and the server stops serving it there.
   * Nobody took it: the drawer stays on the post instead of closing with the
   * word a colleague's mark gets.
   */
  it("keeps the drawer on a post that aged out of the window while it was read", async () => {
    state.username = "curator1";
    vi.mocked(infoToast).mockClear();
    router.on(/curation-desk\/roster-feed/, () =>
      makeRosterPage([
        makeRow({ post_id: 11, created: iso(-(24 * 3_600_000 - 30_000)), overlay: makeOverlay() }),
        makeRow({ post_id: 12, overlay: makeOverlay() }),
      ])
    );
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    expect(await screen.findAllByRole("article")).toHaveLength(2);
    await act(async () => press("j"));
    await act(async () => press("Enter"));
    expect(screen.getByTestId("quick-view-open")).toHaveTextContent("11");

    // A minute later the post is past 24 h: page one comes back without it
    // once a new post moves the head.
    router
      .on(/curation-desk\/roster-feed/, () => makeRosterPage([makeRow({ post_id: 12, overlay: makeOverlay() })]))
      .on(/curation-desk\/status/, () => makeStatus({ feed_version: "v2", latest_post_id: 99 }));
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
    }
    await waitFor(() => expect(document.getElementById("curation-row-title-11")).toBeNull());
    expect(screen.getByTestId("quick-view-open")).toHaveTextContent("11");
    expect(infoToast).not.toHaveBeenCalledWith("curation-desk.live.left-queue");
  });

  /**
   * A held post has no place left in the list to step down from, so Reviewed
   * on it releases the hold and walks on to the successor saved when it left.
   */
  it("walks on from a post held after it aged out when it is reviewed", async () => {
    // Own ids: the desk remembers the posts this tab wrote for the whole
    // module, so marking 11 here would mute the tick deltas later cases send
    // for it.
    state.username = "curator1";
    router.on(/curation-desk\/roster-feed/, () =>
      makeRosterPage([
        makeRow({ post_id: 21, created: iso(-(24 * 3_600_000 - 30_000)), overlay: makeOverlay() }),
        makeRow({ post_id: 22, overlay: makeOverlay() }),
      ])
    );
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    expect(await screen.findAllByRole("article")).toHaveLength(2);
    await act(async () => press("j"));
    await act(async () => press("Enter"));

    router
      .on(/curation-desk\/roster-feed/, () => makeRosterPage([makeRow({ post_id: 22, overlay: makeOverlay() })]))
      .on(/curation-desk\/status/, () => makeStatus({ feed_version: "v2", latest_post_id: 99 }));
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
    }
    await waitFor(() => expect(document.getElementById("curation-row-title-21")).toBeNull());
    expect(screen.getByTestId("quick-view-open")).toHaveTextContent("21");

    // The mark never answers, so only the click itself can move the drawer,
    // the way r steps down in the queue before the server has replied.
    router.on(/curation-desk\/mark$/, () => new Promise(() => {}));
    await act(async () => {
      fireEvent.click(screen.getByLabelText("drawer-reviewed"));
    });
    await waitFor(() => expect(screen.getByTestId("quick-view-open")).toHaveTextContent("22"));
    await waitFor(() => expect(router.callsTo(/curation-desk\/mark$/)).toHaveLength(1));
    expect(router.callsTo(/curation-desk\/mark$/)[0].body).toMatchObject({ permlink: "post-21", state: "reviewed" });
  });

  /**
   * Snooze and flag go through a dialog and move nothing on the click, so a
   * held post walks on once the mark has landed.
   */
  it("walks on from a held post once a snooze on it has landed", async () => {
    // Own ids, for the same reason as the case above.
    state.username = "curator1";
    router.on(/curation-desk\/roster-feed/, () =>
      makeRosterPage([
        makeRow({ post_id: 31, created: iso(-(24 * 3_600_000 - 30_000)), overlay: makeOverlay() }),
        makeRow({ post_id: 32, overlay: makeOverlay() }),
      ])
    );
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    expect(await screen.findAllByRole("article")).toHaveLength(2);
    await act(async () => press("j"));
    await act(async () => press("Enter"));

    router
      .on(/curation-desk\/roster-feed/, () => makeRosterPage([makeRow({ post_id: 32, overlay: makeOverlay() })]))
      .on(/curation-desk\/status/, () => makeStatus({ feed_version: "v2", latest_post_id: 99 }));
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
    }
    await waitFor(() => expect(document.getElementById("curation-row-title-31")).toBeNull());
    expect(screen.getByTestId("quick-view-open")).toHaveTextContent("31");

    await act(async () => {
      fireEvent.click(screen.getByLabelText("drawer-snooze"));
    });
    fireEvent.click(await screen.findByLabelText("curation-desk.snooze.preset-3"));
    await waitFor(() => expect(router.callsTo(/curation-desk\/mark$/)).toHaveLength(1));
    expect(router.callsTo(/curation-desk\/mark$/)[0].body).toMatchObject({ permlink: "post-31", state: "snoozed" });
    await waitFor(() => expect(screen.getByTestId("quick-view-open")).toHaveTextContent("32"));
  });

  /**
   * A reply the curator has not sent. Both halves are the REAL signal: the
   * editor's own draft key (`Comment` writes it on every keystroke) and the
   * drawer reporting which row its box is open for. An earlier version of this
   * test hand-mounted a textarea under document.body, which passed for the
   * wrong reason — the drawer unmounts during the render that drops the row,
   * so anything inside it is gone before the departure effect looks.
   */
  function typeUnsentReply(author: string, permlink: string, text: string) {
    reply.openFor = `${author}/${permlink}`;
    window.localStorage.setItem(`ecency_reply_text_${author}_${permlink}`, JSON.stringify(text));
  }

  it("holds the drawer on a post that left the queue while a reply is half-written", async () => {
    // The report: curate a post with Hide Curated on, start a comment, and a
    // few seconds later the row leaves the feed and takes the editor with it.
    state.username = "curator1";
    vi.mocked(infoToast).mockClear();
    typeUnsentReply("author11", "post-11", "half a sent");
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    expect(await screen.findAllByRole("article")).toHaveLength(2);
    await act(async () => press("j"));
    await act(async () => press("Enter"));
    expect(screen.getByTestId("quick-view-open")).toHaveTextContent("11");

    router.on(/curation-desk\/tick/, tickReviewing(11));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    await waitFor(() => expect(document.getElementById("curation-row-title-11")).toBeNull());

    // The drawer stays on the post being replied to, and says nothing.
    expect(screen.getByTestId("quick-view-open")).toHaveTextContent("11");
    expect(infoToast).not.toHaveBeenCalled();
    // Nothing is selected while it is held, so a stray key cannot mark post 12.
    expect(document.getElementById("curation-row-title-12")?.closest("article")).not.toHaveAttribute(
      "aria-current"
    );
    // j releases the hold and lands on the row that took its place.
    await act(async () => press("j"));
    expect(document.getElementById("curation-row-title-12")?.closest("article")).toHaveAttribute(
      "aria-current",
      "true"
    );
    expect(screen.getByTestId("quick-view-open")).toHaveTextContent("12");
  });

  it("closes as before when the box is open but empty, so an abandoned box pins nothing", async () => {
    state.username = "curator1";
    vi.mocked(infoToast).mockClear();
    typeUnsentReply("author11", "post-11", "   ");
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    expect(await screen.findAllByRole("article")).toHaveLength(2);
    await act(async () => press("j"));
    await act(async () => press("Enter"));

    router.on(/curation-desk\/tick/, tickReviewing(11));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    await waitFor(() => expect(document.getElementById("curation-row-title-11")).toBeNull());
    expect(screen.queryByTestId("quick-view-open")).toBeNull();
    expect(infoToast).toHaveBeenCalledWith("curation-desk.live.left-queue");
  });

  it("closes when a draft exists but the curator never opened the box on this visit", async () => {
    // A draft left on a past visit must not pin a drawer nobody is typing in.
    state.username = "curator1";
    vi.mocked(infoToast).mockClear();
    typeUnsentReply("author11", "post-11", "from yesterday");
    reply.openFor = null;
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    expect(await screen.findAllByRole("article")).toHaveLength(2);
    await act(async () => press("j"));
    await act(async () => press("Enter"));

    router.on(/curation-desk\/tick/, tickReviewing(11));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    await waitFor(() => expect(document.getElementById("curation-row-title-11")).toBeNull());
    expect(screen.queryByTestId("quick-view-open")).toBeNull();
    expect(infoToast).toHaveBeenCalledWith("curation-desk.live.left-queue");
  });

  it("keeps the drawer on the next post after the curator's own r, without the word", async () => {
    state.username = "curator1";
    vi.mocked(infoToast).mockClear();
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    expect(await screen.findAllByRole("article")).toHaveLength(2);
    await act(async () => press("j"));
    await act(async () => press("Enter"));
    await act(async () => press("r"));
    await waitFor(() => expect(document.getElementById("curation-row-title-11")).toBeNull());
    expect(screen.getByTestId("quick-view-open")).toHaveTextContent("12");
    expect(infoToast).not.toHaveBeenCalled();
  });

  it("follows the curator's own r on the last row to the row before it, drawer open, without the word", async () => {
    state.username = "curator1";
    vi.mocked(infoToast).mockClear();
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    expect(await screen.findAllByRole("article")).toHaveLength(2);
    await act(async () => press("j"));
    await act(async () => press("j"));
    await act(async () => press("Enter"));
    expect(screen.getByTestId("quick-view-open")).toHaveTextContent("12");
    await act(async () => press("r"));
    await waitFor(() => expect(document.getElementById("curation-row-title-12")).toBeNull());
    expect(document.getElementById("curation-row-title-11")?.closest("article")).toHaveAttribute("aria-current", "true");
    expect(screen.getByTestId("quick-view-open")).toHaveTextContent("11");
    expect(infoToast).not.toHaveBeenCalled();
  });

  it("treats a departure after a failed mark as a colleague's: nothing of the curator's was written", async () => {
    state.username = "curator1";
    vi.mocked(infoToast).mockClear();
    router.on(/curation-desk\/mark$/, () => jsonResponse({ error: "down" }, 500));
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    expect(await screen.findAllByRole("article")).toHaveLength(2);
    await act(async () => press("j"));
    await act(async () => press("Enter"));
    // A snooze keeps the selection where it is until the answer, unlike r.
    await act(async () => press("z"));
    fireEvent.click(await screen.findByLabelText("curation-desk.snooze.preset-3"));
    await waitFor(() => expect(router.callsTo(/curation-desk\/mark$/)).toHaveLength(1));
    expect(screen.getByTestId("quick-view-open")).toHaveTextContent("11");

    router.on(/curation-desk\/tick/, tickReviewing(11));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    await waitFor(() => expect(document.getElementById("curation-row-title-11")).toBeNull());
    expect(screen.queryByTestId("quick-view-open")).toBeNull();
    expect(infoToast).toHaveBeenCalledWith("curation-desk.live.left-queue");
  });

  it("moves the selection to the new last row when the last one leaves", async () => {
    state.username = "curator1";
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    expect(await screen.findAllByRole("article")).toHaveLength(2);
    await act(async () => press("j"));
    await act(async () => press("j"));
    expect(document.getElementById("curation-row-title-12")?.closest("article")).toHaveAttribute("aria-current", "true");
    router.on(/curation-desk\/tick/, tickReviewing(12));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    await waitFor(() => expect(document.getElementById("curation-row-title-12")).toBeNull());
    expect(document.getElementById("curation-row-title-11")?.closest("article")).toHaveAttribute("aria-current", "true");
  });

  it("chooses nothing in a different feed: a lens change clears the selection and closes the drawer", async () => {
    state.username = "curator1";
    router.on(/curation-desk\/roster-feed/, (_url, init) => {
      const body = JSON.parse(String(init?.body));
      return body.flagged
        ? makeRosterPage([makeRow({ post_id: 21, overlay: makeOverlay({ team_mark: "flagged" }) }), makeRow({ post_id: 22, overlay: makeOverlay({ team_mark: "flagged" }) })])
        : makeRosterPage([makeRow({ post_id: 11, overlay: makeOverlay() }), makeRow({ post_id: 12, overlay: makeOverlay() })]);
    });
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    expect(await screen.findAllByRole("article")).toHaveLength(2);
    await act(async () => press("j"));
    await act(async () => press("j"));
    await act(async () => press("Enter"));
    expect(screen.getByTestId("quick-view-open")).toHaveTextContent("12");

    fireEvent.click(screen.getByRole("switch", { name: "curation-desk.filters.flagged" }));
    await waitFor(() => expect(document.getElementById("curation-row-title-21")).not.toBeNull());
    expect(screen.queryAllByRole("article").some((a) => a.getAttribute("aria-current") === "true")).toBe(false);
    expect(screen.queryByTestId("quick-view-open")).toBeNull();

    // Back and forth once more: both feeds are cached now, so the switch
    // lands on the other list with no empty frame in between, the case
    // where a departed-row fallback would pick a row nobody chose.
    fireEvent.click(screen.getByRole("switch", { name: "curation-desk.filters.flagged" }));
    await waitFor(() => expect(document.getElementById("curation-row-title-12")).not.toBeNull());
    await act(async () => press("j"));
    await act(async () => press("j"));
    await act(async () => press("Enter"));
    expect(screen.getByTestId("quick-view-open")).toHaveTextContent("12");
    fireEvent.click(screen.getByRole("switch", { name: "curation-desk.filters.flagged" }));
    await waitFor(() => expect(document.getElementById("curation-row-title-22")).not.toBeNull());
    expect(screen.queryAllByRole("article").some((a) => a.getAttribute("aria-current") === "true")).toBe(false);
    expect(screen.queryByTestId("quick-view-open")).toBeNull();
  });

  it("leaves the selection alone when the selected row only folds into a collapsed tail", async () => {
    state.username = "curator1";
    // Row 11 crosses the 24 h line 30 s from now; under window=all it then
    // folds into the half-weight tail, still loaded, just not listed. The
    // desk opens under 24 h, so the curator has picked All windows.
    const { saveFilters } = await import("@/features/curation-desk/curation-filter-storage");
    saveFilters("curator1", { window: "all" });
    router.on(/curation-desk\/roster-feed/, () =>
      makeRosterPage([makeRow({ post_id: 11, created: iso(-(24 * 3_600_000 - 30_000)), overlay: makeOverlay() }), makeRow({ post_id: 12, overlay: makeOverlay() })])
    );
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    expect(await screen.findAllByRole("article")).toHaveLength(2);
    await act(async () => press("j"));
    expect(document.getElementById("curation-row-title-11")?.closest("article")).toHaveAttribute("aria-current", "true");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(70_000);
    });
    await waitFor(() => expect(document.getElementById("curation-row-title-11")).toBeNull());
    // Not re-targeted at row 12: nothing was chosen there.
    expect(document.getElementById("curation-row-title-12")?.closest("article")).not.toHaveAttribute("aria-current");
  });

  it("asks for the next page itself when every loaded row left live and the route holds more", async () => {
    state.username = "curator1";
    router.on(/curation-desk\/roster-feed/, (_url, init) => {
      const body = JSON.parse(String(init?.body));
      return body.cursor
        ? makeRosterPage([makeRow({ post_id: 13, overlay: makeOverlay() })], { next_cursor: null })
        : makeRosterPage([makeRow({ post_id: 11, overlay: makeOverlay() }), makeRow({ post_id: 12, overlay: makeOverlay() })], { next_cursor: "c12" });
    });
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    expect(await screen.findAllByRole("article")).toHaveLength(2);
    expect(router.callsTo(/curation-desk\/roster-feed/)).toHaveLength(1);

    router.on(/curation-desk\/tick/, tickReviewing(11, 12));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    // No list to reach the end of, so the view asks on its own; the empty
    // state never shows over a queue the server still holds.
    await waitFor(() => expect(document.getElementById("curation-row-title-13")).not.toBeNull());
    expect(screen.queryByText("curation-desk.list.empty")).toBeNull();
    const second = router.callsTo(/curation-desk\/roster-feed/)[1].body as Record<string, unknown>;
    expect(second.cursor).toBe("c12");
  });

  it("binds a pending c or p to the row that asked, so moving on before the entry loads drops it", async () => {
    state.username = "curator1";
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    await screen.findAllByRole("article");
    await act(async () => press("j"));
    await act(async () => press("c"));
    expect(screen.getByTestId("quick-view-open")).toHaveAttribute("data-comment", "true");
    // The drawer never answered (entry still loading); the curator moves on.
    await act(async () => press("j"));
    expect(screen.getByTestId("quick-view-open")).toHaveTextContent("12");
    expect(screen.getByTestId("quick-view-open")).toHaveAttribute("data-comment", "false");
    await act(async () => press("p"));
    expect(screen.getByTestId("quick-view-open")).toHaveAttribute("data-tip", "true");
    await act(async () => press("k"));
    expect(screen.getByTestId("quick-view-open")).toHaveAttribute("data-tip", "false");
    // Back on 12: nothing pending is left over from before.
    await act(async () => press("j"));
    expect(screen.getByTestId("quick-view-open")).toHaveAttribute("data-tip", "false");
    // Not even for one render: the drawer consumes the flag in its own effect,
    // which runs before the queue view could clear it.
    expect(drawerRenders.some((r) => r.post_id === 12 && r.comment)).toBe(false);
    expect(drawerRenders.some((r) => r.post_id === 11 && r.tip)).toBe(false);
    expect(drawerRenders.some((r) => r.post_id === 11 && r.comment)).toBe(true);
    expect(drawerRenders.some((r) => r.post_id === 12 && r.tip)).toBe(true);
  });

  it("does not keep asking for a next page that failed", async () => {
    state.username = "curator1";
    router.on(/curation-desk\/roster-feed/, (_url, init) => {
      const body = JSON.parse(String(init?.body));
      return body.cursor
        ? jsonResponse({ error: "down" }, 500)
        : makeRosterPage([makeRow({ post_id: 11, overlay: makeOverlay() }), makeRow({ post_id: 12, overlay: makeOverlay() })], { next_cursor: "c12" });
    });
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    expect(await screen.findAllByRole("article")).toHaveLength(2);
    router.on(/curation-desk\/tick/, tickReviewing(11, 12));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    await waitFor(() => expect(router.callsTo(/curation-desk\/roster-feed/).length).toBeGreaterThanOrEqual(2));
    // The one failed ask, and no loop behind it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(router.callsTo(/curation-desk\/roster-feed/)).toHaveLength(2);
  });

  it("Enter opens the drawer once: the row no longer handles it too", async () => {
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    const articles = await screen.findAllByRole("article");
    // Focus a row the way a keyboard user reaches it, then press Enter on it.
    await act(async () => press("j"));
    await act(async () => press("Enter", {}, articles[0]));
    expect(screen.getByTestId("quick-view-open")).toBeInTheDocument();
    // A second Enter closes it: one handler, not two cancelling each other.
    await act(async () => press("Enter", {}, articles[0]));
    expect(screen.queryByTestId("quick-view-open")).toBeNull();
  });

  it("r never posts for a member", async () => {
    state.username = "member1";
    renderWithQueryClient(<CurationQueueView />, { queryClient: client() });
    await screen.findAllByRole("article");
    await act(async () => press("j"));
    await act(async () => press("r"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(router.callsTo(/curation-desk\/mark$/)).toHaveLength(0);
  });
});

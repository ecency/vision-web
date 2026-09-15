import React from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";
import {
  installFetchRouter,
  jsonResponse,
  makeFeedPage,
  makeOverlay,
  makeRoster,
  makeRosterPage,
  makeRow,
  makeStatus,
  NOW,
} from "./curation-test-utils";

const state = vi.hoisted(() => ({ username: undefined as string | undefined }));

// The global @ecency/sdk mock has an explicit export list; the desk needs the real
// builders, request functions and voting helpers.
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
}));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  ensureValidToken: vi.fn(async () => "code-1"),
  getAccessToken: vi.fn(() => "code-1"),
}));
vi.mock("@/core/hooks/use-active-username", () => ({
  useActiveUsername: () => state.username,
}));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: state.username ? { username: state.username } : null, account: null, isLoading: false }),
}));
vi.mock("@/core/global-store", () => ({
  useGlobalStore: (selector: (s: unknown) => unknown) =>
    selector({ toggleUiProp: vi.fn(), activeUser: state.username ? { username: state.username } : null }),
}));
vi.mock("@/config", () => ({
  EcencyConfigManager: {
    useConfig: (cond: (c: unknown) => unknown) =>
      cond({ visionFeatures: { curationDesk: { enabled: true, recommendations: { enabled: true } } } }),
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
    return <div data-testid="virtuoso">{props.data.map((item, i) => <React.Fragment key={i}>{props.itemContent(i, item)}</React.Fragment>)}</div>;
  }),
}));
vi.mock("@/features/curation-desk/curation-quick-view", () => ({ CurationQuickView: () => null }));
vi.mock("@/features/shared/profile-popover", () => ({ ProfilePopover: ({ entry }: { entry: { author: string } }) => <span>@{entry.author}</span> }));
vi.mock("@/features/shared/user-avatar", () => ({ UserAvatar: () => <span data-testid="avatar" /> }));
vi.mock("@/features/shared/feedback", () => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/api/format-error", () => ({ formatError: (e: unknown) => [String(e), "common"] }));
vi.mock("@/api/sdk-mutations/use-curation-recommend-mutation", () => ({
  useCurationRecommendMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { CurationQueueView } from "@/features/curation-desk/curation-queue-view";
import { CurationHeader } from "@/features/curation-desk/curation-header";
import { error as errorToast } from "@/features/shared/feedback";

/** Mirrors production: refetchOnMount false, so page 1 must come from the mount itself. */
function prodLikeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnMount: false, refetchOnWindowFocus: false, staleTime: 60_000, gcTime: Infinity } },
  });
}

describe("CurationQueueView", () => {
  let fetchRouter: ReturnType<typeof installFetchRouter>;
  let statusBody = makeStatus();
  let feedPage = makeFeedPage([makeRow({ post_id: 1 }), makeRow({ post_id: 2 })]);

  beforeEach(() => {
    // Fixture ages are offsets from NOW; the desk reads the real clock, so the
    // rows drift out of their window once wall time passes NOW + 24 h.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    state.username = undefined;
    vi.mocked(errorToast).mockClear();
    statusBody = makeStatus();
    feedPage = makeFeedPage([makeRow({ post_id: 1 }), makeRow({ post_id: 2 })]);
    fetchRouter = installFetchRouter()
      .on(/curation-desk\/status/, () => statusBody)
      .on(/curation-desk\/roster$/, () => makeRoster())
      .on(/curation-desk\/feed/, () => feedPage)
      .on(/curation-desk\/roster-feed/, () =>
        makeRosterPage([makeRow({ post_id: 11, overlay: makeOverlay() }), makeRow({ post_id: 12, overlay: makeOverlay() })])
      )
      .on(/curation-desk\/tick/, () => ({
        overlay: [],
        deltas: { marks: [], flags: [], signals: [] },
        team_cursor: { post_id: null, created: null },
        active_curators: [],
        trail_alerts: [],
        generated_at: "2026-09-05T12:00:15Z",
        truncated: false,
      }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    // Vitest isolates per file, not per test, and the refine filters now
    // persist: without this a filter set in one case narrows the next one.
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("requests page 1 on mount without endReached (initialData trap guard)", async () => {
    renderWithQueryClient(<CurationQueueView />, { queryClient: prodLikeClient() });
    await waitFor(() => expect(fetchRouter.callsTo(/curation-desk\/feed/)).toHaveLength(1));
    expect(await screen.findAllByRole("article")).toHaveLength(2);
    const [call] = fetchRouter.callsTo(/curation-desk\/feed/);
    expect(call.method).toBe("GET");
    expect(call.url).not.toContain("cursor=");
    // No roster lookup for an anonymous visitor.
    expect(fetchRouter.callsTo(/curation-desk\/roster$/)).toHaveLength(0);
  });

  /**
   * `restored` flips in the mount effect, so the first commit of a remount has
   * the cached rows and no restore yet. The skeleton must not paint over them:
   * a curator switching tabs saw the desk "load" a list that was already there.
   */
  it("never paints the skeleton over rows the cache already holds on a remount", async () => {
    const queryClient = prodLikeClient();
    const { unmount } = renderWithQueryClient(<CurationQueueView />, { queryClient });
    expect(await screen.findAllByRole("article")).toHaveLength(2);
    unmount();

    // The first commit is gone by the time render() returns (act flushes the
    // mount effect), so a sibling probes the DOM from a layout effect, which
    // runs after the commit's DOM writes and before the mount effect.
    const commits: { skeleton: boolean; articles: number }[] = [];
    function Probe() {
      React.useLayoutEffect(() => {
        commits.push({
          skeleton: document.querySelector("[aria-label='curation-desk.list.loading']") !== null,
          articles: document.querySelectorAll("[role='article']").length,
        });
      });
      return null;
    }
    renderWithQueryClient(
      <>
        <CurationQueueView />
        <Probe />
      </>,
      { queryClient }
    );
    expect(screen.getAllByRole("article")).toHaveLength(2);
    await waitFor(() => expect(screen.getByRole("feed")).toHaveAttribute("aria-busy", "false"));
    // The probe only sees the commits that render it: the first one, before
    // the mount effect. The virtual list fills its rows in a later commit, so
    // that first paint is either the skeleton or the list surface waiting for
    // its rows; the former is the flash this pins.
    expect(commits).toEqual([{ skeleton: false, articles: 0 }]);
    expect(screen.queryByLabelText("curation-desk.list.loading")).not.toBeInTheDocument();
  });

  /**
   * The saved refine set is read in an effect, so both feeds wait for it. The
   * public feed is the path that proves it: on a hard load the store has not
   * published the active user yet, so the viewer reads as anonymous and the
   * feed is enabled on the very first render. Without the gate it asks for
   * page 1 on the defaults and then again on the restored params.
   */
  it("issues exactly one page-1 request, already carrying the saved filters", async () => {
    // The store fills activeUser in its own mount effect, so this is undefined
    // on the first render while the key it reads is already there.
    state.username = undefined;
    window.localStorage.setItem("ecency_active_user", JSON.stringify("member1"));
    window.localStorage.setItem(
      "ecency_curation-desk-filters",
      JSON.stringify({ v: 1, users: { member1: { filters: { app: "peakd" } } } })
    );

    renderWithQueryClient(<CurationQueueView />, { queryClient: prodLikeClient() });

    await waitFor(() => expect(fetchRouter.callsTo(/curation-desk\/feed/)).toHaveLength(1));
    expect(fetchRouter.callsTo(/curation-desk\/feed/)[0].url).toContain("app=peakd");
    // Nothing went out on the defaults first, and nothing follows to correct it.
    await waitFor(() => expect(screen.getAllByRole("article").length).toBeGreaterThan(0));
    expect(fetchRouter.callsTo(/curation-desk\/feed/)).toHaveLength(1);
  });

  /**
   * The hand-off names curators and counts their marks, which spec 8 keeps
   * roster-only permanently. The backend fences it out of every public payload;
   * this is the same fence on the render side.
   */
  it("shows the team hand-off to the roster and never to a public visitor", async () => {
    renderWithQueryClient(<CurationQueueView />, { queryClient: prodLikeClient() });
    await waitFor(() => expect(fetchRouter.callsTo(/curation-desk\/feed/)).toHaveLength(1));
    expect(screen.queryByText("curation-desk.handoff.title")).toBeNull();
    cleanup();

    state.username = "curator1";
    renderWithQueryClient(<CurationQueueView />, { queryClient: prodLikeClient() });
    expect(await screen.findByText("curation-desk.handoff.title")).toBeInTheDocument();
  });

  /**
   * The loaded page seeds the bar before the first tick. Once a tick has
   * answered it is the authority, an answer with no hand-off at all included:
   * during a rolling deploy a page from the new backend can be followed by a
   * tick from the old one, and falling back to the page then would revive its
   * entries and label them freshly updated.
   */
  it("stops showing the page's hand-off once a tick answers without one", async () => {
    state.username = "curator1";
    fetchRouter.on(/curation-desk\/roster-feed/, () =>
      makeRosterPage([makeRow({ post_id: 11, overlay: makeOverlay() })], {
        handoff: [
          {
            username: "seckorama",
            reviewed_to: "2026-09-05T08:14:00",
            reviewed_to_post_id: 9,
            last_mark_at: "2026-09-05T10:00:00",
            marks_24h: 3,
            lane: {},
          },
        ],
      })
    );
    renderWithQueryClient(<CurationQueueView />, { queryClient: prodLikeClient() });
    // seeded from the page, before any tick
    expect(await screen.findByText("@seckorama")).toBeInTheDocument();

    // the tick mock above answers with no `handoff` at all: an older backend
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    await waitFor(() => expect(screen.queryByText("@seckorama")).toBeNull());
    expect(screen.queryByText("curation-desk.handoff.empty")).toBeNull();
  });

  /**
   * "Your queue starts at the oldest post nobody has handled" is true only with
   * every handled kind out of the list. Showing curated posts puts handled rows
   * back in, so the sentence goes.
   */
  it("drops the where-you-start sentence once curated posts are shown", async () => {
    state.username = "curator1";
    renderWithQueryClient(<CurationQueueView />, { queryClient: prodLikeClient() });
    expect(await screen.findByText("curation-desk.handoff.where-you-start")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "curation-desk.filters.hide-curated" }));

    await waitFor(() => expect(screen.queryByText("curation-desk.handoff.where-you-start")).toBeNull());
  });

  it("loads the roster feed with hide_reviewed on the key for a roster user", async () => {
    state.username = "curator1";
    renderWithQueryClient(<CurationQueueView />, { queryClient: prodLikeClient() });
    await waitFor(() => expect(fetchRouter.callsTo(/curation-desk\/roster-feed/)).toHaveLength(1));
    const [call] = fetchRouter.callsTo(/curation-desk\/roster-feed/);
    expect(call.method).toBe("POST");
    expect(call.body).toMatchObject({ code: "code-1", sort: "queue", limit: "25" });
    // hide_reviewed and hide_snoozed default to on at the desk, so the roster
    // default sends neither; only switching them off says anything.
    expect(call.body).not.toHaveProperty("hide_reviewed");
    expect(call.body).not.toHaveProperty("hide_snoozed");
    expect(fetchRouter.callsTo(/curation-desk\/feed\?/)).toHaveLength(0);
    expect(await screen.findAllByRole("article")).toHaveLength(2);
    // The roster page's total_estimate feeds the count, never a client count.
    // It is the backlog at every age, so under the default 24 h window it
    // reads as backlog rather than matches.
    expect(screen.getByText("curation-desk.toolbar.backlog")).toBeInTheDocument();
  });

  it("loads the public feed for a logged-in member who is not on the roster", async () => {
    state.username = "member1";
    renderWithQueryClient(<CurationQueueView />, { queryClient: prodLikeClient() });
    await waitFor(() => expect(fetchRouter.callsTo(/curation-desk\/feed\?/)).toHaveLength(1));
    expect(fetchRouter.callsTo(/curation-desk\/roster-feed/)).toHaveLength(0);
    // Roster-only actions are absent for a member.
    await screen.findAllByRole("article");
    expect(screen.queryByLabelText("curation-desk.actions.reviewed")).toBeNull();
  });

  it("refetches page 1 only when status.feed_version changes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithQueryClient(<CurationQueueView />, { queryClient: prodLikeClient() });
    await waitFor(() => expect(fetchRouter.callsTo(/curation-desk\/feed\?/)).toHaveLength(1));
    // Mount status fetch, then the first poll only records the version.
    await waitFor(() => expect(fetchRouter.callsTo(/curation-desk\/status/).length).toBeGreaterThanOrEqual(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchRouter.callsTo(/curation-desk\/feed\?/)).toHaveLength(1);

    statusBody = makeStatus({ feed_version: "v2" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await waitFor(() => expect(fetchRouter.callsTo(/curation-desk\/feed\?/)).toHaveLength(2));
    const [, second] = fetchRouter.callsTo(/curation-desk\/feed\?/);
    expect(second.url).not.toContain("cursor=");
  });

  it("keeps polling status while the queue is empty, so the first matching post arrives", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    feedPage = makeFeedPage([]);
    renderWithQueryClient(<CurationQueueView />, { queryClient: prodLikeClient() });
    await waitFor(() => expect(fetchRouter.callsTo(/curation-desk\/feed\?/)).toHaveLength(1));
    await waitFor(() => expect(screen.getByText("curation-desk.list.empty")).toBeInTheDocument());

    // An empty filtered view is the one that most needs to hear about a new
    // post, so the poll cannot be gated on the rows it does not have.
    statusBody = makeStatus({ feed_version: "v2", latest_post_id: 7 });
    feedPage = makeFeedPage([makeRow({ post_id: 7 })], { feed_version: "v2" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await waitFor(() => expect(fetchRouter.callsTo(/curation-desk\/feed\?/)).toHaveLength(2));
    expect(await screen.findAllByRole("article")).toHaveLength(1);
  });

  // The undo bar is the only place a viewer can see whether the undo landed,
  // so it may not disappear before the request it started has answered.
  it("keeps the undo bar up until the undo settled and reports a rejection", async () => {
    state.username = "curator1";
    let settleClear: (value: unknown) => void = () => undefined;
    const clearing = new Promise((resolve) => {
      settleClear = resolve;
    });
    fetchRouter.on(/curation-desk\/mark$/, () => ({ ok: true }));
    fetchRouter.on(/curation-desk\/mark-clear$/, () => clearing);

    renderWithQueryClient(<CurationQueueView />, { queryClient: prodLikeClient() });
    await screen.findAllByRole("article");

    fireEvent.click(screen.getAllByLabelText("curation-desk.actions.reviewed")[0]);
    const undo = await screen.findByLabelText("curation-desk.live.undo");

    fireEvent.click(undo);
    await waitFor(() => expect(fetchRouter.callsTo(/curation-desk\/mark-clear$/)).toHaveLength(1));
    // The request has not answered yet: the bar stays, and nothing is reported.
    expect(screen.getByLabelText("curation-desk.live.undo")).toBeInTheDocument();
    expect(errorToast).not.toHaveBeenCalled();

    await act(async () => {
      settleClear(jsonResponse({ error: "gone" }, 500));
      await Promise.resolve();
    });
    await waitFor(() => expect(errorToast).toHaveBeenCalled());
  });

  it("keeps a newer undo when an older undo settles", async () => {
    state.username = "curator1";
    let settleClear: (value: unknown) => void = () => undefined;
    const clearing = new Promise((resolve) => {
      settleClear = resolve;
    });
    fetchRouter.on(/curation-desk\/mark$/, () => ({ ok: true }));
    fetchRouter.on(/curation-desk\/mark-clear$/, () => clearing);

    renderWithQueryClient(<CurationQueueView />, { queryClient: prodLikeClient() });
    await screen.findAllByRole("article");

    fireEvent.click(screen.getAllByLabelText("curation-desk.actions.reviewed")[0]);
    fireEvent.click(await screen.findByLabelText("curation-desk.live.undo"));
    await waitFor(() => expect(fetchRouter.callsTo(/curation-desk\/mark-clear$/)).toHaveLength(1));

    // Another row is reviewed while that undo is still in flight: its bar
    // replaces the old one.
    fireEvent.click(screen.getAllByLabelText("curation-desk.actions.reviewed").at(-1)!);
    await waitFor(() => expect(fetchRouter.callsTo(/curation-desk\/mark$/)).toHaveLength(2));

    await act(async () => {
      settleClear(jsonResponse({ ok: true }, 200));
      await Promise.resolve();
    });
    // The older undo settled; the newer bar is still up, and live again.
    await waitFor(() => expect(screen.getByLabelText("curation-desk.live.undo")).toBeEnabled());
    expect(errorToast).not.toHaveBeenCalled();
  });

  it("renders the list as a feed of articles with an aria-labelledby title", async () => {
    renderWithQueryClient(<CurationQueueView />, { queryClient: prodLikeClient() });
    const articles = await screen.findAllByRole("article");
    expect(screen.getByRole("feed")).toBeInTheDocument();
    for (const article of articles) {
      const id = article.getAttribute("aria-labelledby");
      expect(id).toBeTruthy();
      expect(document.getElementById(id!)).not.toBeNull();
      const titleLink = document.getElementById(id!)!.querySelector("a");
      expect(titleLink?.getAttribute("href")).toMatch(/^\/@author\d+\/post-\d+$/);
    }
  });

  it("keeps advanced filters collapsed and retains their values when reopened", async () => {
    renderWithQueryClient(<CurationQueueView />, { queryClient: prodLikeClient() });
    await screen.findAllByRole("article");
    const summary = screen.getByText("curation-desk.filters.refine").closest("summary")!;
    const panel = summary.closest("details")!;
    expect(panel).not.toHaveAttribute("open");
    fireEvent.click(summary);
    expect(panel).toHaveAttribute("open");
    fireEvent.change(screen.getByLabelText("curation-desk.filters.app"), { target: { value: "peakd" } });
    await waitFor(() => expect(fetchRouter.callsTo(/curation-desk\/feed/).some((call) => call.url.includes("app=peakd"))).toBe(true));
    fireEvent.click(summary);
    expect(panel).not.toHaveAttribute("open");
    expect(screen.getByText("curation-desk.filters.active-count").parentElement).toHaveTextContent("1");
    fireEvent.click(summary);
    expect(screen.getByLabelText("curation-desk.filters.app")).toHaveValue("peakd");
    fireEvent.click(screen.getByLabelText("curation-desk.toolbar.reset"));
    expect(screen.getByLabelText("curation-desk.filters.app")).toHaveValue("all");
    expect(screen.queryByText("curation-desk.filters.active-count")).not.toBeInTheDocument();
  });

  /**
   * A drag is many input events. Each one used to be a filter change, hence a
   * new feed key, a page-one request and a saved-filters write; the queue
   * re-rendered under the thumb. The range now lands when the thumb is let go.
   */
  it("applies the reputation range on the release, wherever it happens, not on every step", async () => {
    renderWithQueryClient(<CurationQueueView />, { queryClient: prodLikeClient() });
    await screen.findAllByRole("article");
    fireEvent.click(screen.getByText("curation-desk.filters.refine").closest("summary")!);
    const repMin = screen.getByLabelText("curation-desk.filters.rep-min");
    const feedCalls = () => fetchRouter.callsTo(/curation-desk\/feed\?/).length;
    const before = feedCalls();

    // A drag is `input` events; the browser fires `change` once on release,
    // on the input, even when the pointer is let go elsewhere on the page.
    fireEvent.input(repMin, { target: { value: "10" } });
    fireEvent.input(repMin, { target: { value: "20" } });
    fireEvent.input(repMin, { target: { value: "30" } });
    expect(repMin).toHaveValue("30");
    expect(feedCalls()).toBe(before);
    expect(fetchRouter.callsTo(/curation-desk\/feed\?/).some((call) => call.url.includes("rep_min="))).toBe(false);

    fireEvent.change(repMin, { target: { value: "30" } });
    await waitFor(() => expect(feedCalls()).toBe(before + 1));
    const last = fetchRouter.callsTo(/curation-desk\/feed\?/).at(-1)!;
    expect(last.url).toContain("rep_min=30");
    expect(last.url).not.toContain("rep_min=10");
  });

  it("counts a min/max word range once in the refine badge, as the shared tally does", async () => {
    renderWithQueryClient(<CurationQueueView />, { queryClient: prodLikeClient() });
    await screen.findAllByRole("article");
    const summary = screen.getByText("curation-desk.filters.refine").closest("summary")!;
    fireEvent.click(summary);
    fireEvent.change(screen.getByLabelText("curation-desk.filters.words"), { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText("curation-desk.filters.words-max-label"), { target: { value: "1000" } });
    await waitFor(() =>
      expect(
        fetchRouter.callsTo(/curation-desk\/feed/).some((call) => call.url.includes("max_words=1000"))
      ).toBe(true)
    );
    // One range, one chip. The badge used to count min and max separately and
    // read 2 while the toolbar's Reset tally, off the shared helper, read 1.
    expect(screen.getByText("curation-desk.filters.active-count").parentElement).toHaveTextContent("1");
  });

  it("leaves the two bar chips out of the refine badge while Reset still counts them", async () => {
    renderWithQueryClient(<CurationQueueView />, { queryClient: prodLikeClient() });
    await screen.findAllByRole("article");
    fireEvent.click(screen.getByLabelText("curation-desk.filters.hide-curated"));
    await waitFor(() =>
      expect(screen.getByLabelText("curation-desk.toolbar.reset")).toBeInTheDocument()
    );
    // The chip sits beside the panel, not inside it: Reset counts it, the panel badge must not.
    expect(screen.queryByText("curation-desk.filters.active-count")).not.toBeInTheDocument();
  });

  it("hydrates the overview when the tabs have already loaded status into the client cache", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
    const header = (loaded: boolean) => (
      <QueryClientProvider client={queryClient}>
        <CurationHeader status={loaded ? makeStatus() : undefined} activeCurators={[]} isRoster={false} livePaused={false} onHelp={() => {}} />
      </QueryClientProvider>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(header(false));
    document.body.appendChild(container);
    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => { root = hydrateRoot(container, header(true), { onRecoverableError }); });
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(container).toHaveTextContent("curation-desk.header.curated-summary");
    } finally {
      await act(async () => root?.unmount());
      container.remove();
      queryClient.clear();
    }
  });

  it("hydrates the status tiles when the tabs have already loaded the status into the client cache", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
    const header = (loaded: boolean) => (
      <QueryClientProvider client={queryClient}>
        <CurationHeader status={loaded ? makeStatus() : undefined} activeCurators={[]} isRoster={false} livePaused={false} onHelp={() => {}} />
      </QueryClientProvider>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(header(false));
    document.body.appendChild(container);
    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => { root = hydrateRoot(container, header(true), { onRecoverableError }); });
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(container).toHaveTextContent("curation-desk.header.curated-today");
    } finally {
      await act(async () => root?.unmount());
      container.remove();
      queryClient.clear();
    }
  });
});

import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
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
    // The roster page's total_estimate feeds the match count, never a client count.
    expect(screen.getByText("curation-desk.toolbar.match")).toBeInTheDocument();
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

  it("renders the list as a feed of articles with an aria-labelledby title", async () => {
    renderWithQueryClient(<CurationQueueView />, { queryClient: prodLikeClient() });
    const articles = await screen.findAllByRole("article");
    expect(screen.getByRole("feed")).toBeInTheDocument();
    for (const article of articles) {
      const id = article.getAttribute("aria-labelledby");
      expect(id).toBeTruthy();
      expect(document.getElementById(id!)).not.toBeNull();
    }
  });
});

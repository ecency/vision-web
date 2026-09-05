import React from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurationRosterFeedPage, CurationTickResponse } from "@ecency/sdk";
import { installFetchRouter, iso, makeOverlay, makeRosterPage, makeRow } from "./curation-test-utils";

vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
}));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  ensureValidToken: vi.fn(async () => "code-1"),
}));
vi.mock("@/core/hooks/use-active-username", () => ({ useActiveUsername: () => "curator1" }));

import { noteCuratorActivity, useCurationTick } from "@/features/curation-desk/hooks";
import { mergeTickIntoPages } from "@/features/curation-desk/curation-tick-merge";

function tickBody(overrides: Partial<CurationTickResponse> = {}): CurationTickResponse {
  return {
    overlay: [],
    deltas: { marks: [], flags: [], signals: [] },
    team_cursor: { post_id: null, created: null },
    active_curators: [],
    trail_alerts: [],
    generated_at: "2026-09-05T12:00:15.123456Z",
    truncated: false,
    ...overrides,
  };
}

function setVisibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value, configurable: true });
}

describe("useCurationTick", () => {
  const feedKey = ["curation", "roster-feed", "curator1", { sort: "queue" }];
  let router: ReturnType<typeof installFetchRouter>;
  let tickResponse = tickBody();
  let queryClient: QueryClient;

  const rowA = makeRow({ post_id: 1, overlay: makeOverlay() });
  const rowB = makeRow({ post_id: 2, overlay: null });

  function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  function seed() {
    queryClient.setQueryData<InfiniteData<CurationRosterFeedPage>>(feedKey, {
      pages: [makeRosterPage([rowA, rowB])],
      pageParams: [undefined],
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility("visible");
    noteCuratorActivity();
    tickResponse = tickBody();
    router = installFetchRouter().on(/curation-desk\/tick/, () => tickResponse);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("does not tick while the tab is hidden or with zero loaded rows", async () => {
    setVisibility("hidden");
    seed();
    const hidden = renderHook(() => useCurationTick({ username: "curator1", enabled: true, feedKey, rows: [rowA, rowB], getVisibleIds: () => [1, 2] }), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000 * 3);
    });
    expect(router.callsTo(/tick/)).toHaveLength(0);
    hidden.unmount();

    setVisibility("visible");
    renderHook(() => useCurationTick({ username: "curator1", enabled: true, feedKey, rows: [], getVisibleIds: () => [] }), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000 * 3);
    });
    expect(router.callsTo(/tick/)).toHaveLength(0);
  });

  it("ticks once on visibilitychange and every 15 s while visible", async () => {
    seed();
    renderHook(() => useCurationTick({ username: "curator1", enabled: true, feedKey, rows: [rowA, rowB], getVisibleIds: () => [1, 2] }), { wrapper });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(router.callsTo(/tick/)).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(router.callsTo(/tick/)).toHaveLength(2);
  });

  it("echoes the previous generated_at as `since` and sends only rows without overlay in `need`", async () => {
    seed();
    renderHook(() => useCurationTick({ username: "curator1", enabled: true, feedKey, rows: [rowA, rowB], getVisibleIds: () => [1, 2, 3] }), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    const first = router.callsTo(/tick/)[0];
    expect(first.body).toMatchObject({ code: "code-1", since: null, need: [2], visible: [1, 2, 3] });

    tickResponse = tickBody({ generated_at: "2026-09-05T12:00:30.000001Z" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    const second = router.callsTo(/tick/)[1];
    expect(second.body?.since).toBe("2026-09-05T12:00:15.123456Z");
  });

  it("seeds `since` from the loaded feed page instead of asking for everything", async () => {
    seed();
    renderHook(
      () =>
        useCurationTick({
          username: "curator1",
          enabled: true,
          feedKey,
          rows: [rowA, rowB],
          getVisibleIds: () => [1, 2],
          feedGeneratedAt: "2026-09-05T11:59:00.000000Z",
        }),
      { wrapper }
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(router.callsTo(/tick/)[0].body?.since).toBe("2026-09-05T11:59:00.000000Z");
  });

  it("never invalidates the feed on a truncated answer to a since-less tick", async () => {
    seed();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    tickResponse = tickBody({ truncated: true });
    renderHook(() => useCurationTick({ username: "curator1", enabled: true, feedKey, rows: [rowA, rowB], getVisibleIds: () => [1, 2] }), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    // A first tick asks for a snapshot; treating that as truncated would
    // refetch the whole queue on every mount.
    expect(router.callsTo(/tick/)[0].body?.since).toBeNull();
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: feedKey });
  });

  it("discards an answer that arrives after the filters changed", async () => {
    seed();
    const otherKey = ["curation", "roster-feed", "curator1", { sort: "newest" }];
    queryClient.setQueryData<InfiniteData<CurationRosterFeedPage>>(otherKey, {
      pages: [makeRosterPage([rowA, rowB])],
      pageParams: [undefined],
    });
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    tickResponse = tickBody({
      deltas: { marks: [{ post_id: 2, curator: "riyat", state: "reviewed", updated_at: iso(0) }], flags: [], signals: [] },
    });
    router.on(/curation-desk\/tick/, async () => {
      await gate;
      return tickResponse;
    });

    const { rerender } = renderHook(
      ({ key }: { key: unknown[] }) =>
        useCurationTick({ username: "curator1", enabled: true, feedKey: key, rows: [rowA, rowB], getVisibleIds: () => [1, 2] }),
      { wrapper, initialProps: { key: feedKey as unknown[] } }
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    // The tick is in flight for the queue the viewer is about to leave.
    rerender({ key: otherKey });
    await act(async () => {
      release?.();
      await vi.advanceTimersByTimeAsync(10);
    });

    const left = queryClient.getQueryData<InfiniteData<CurationRosterFeedPage>>(feedKey)!;
    const arrived = queryClient.getQueryData<InfiniteData<CurationRosterFeedPage>>(otherKey)!;
    expect(arrived.pages[0].items[1].overlay).toBeNull();
    expect(left.pages[0].items[1].overlay).toBeNull();

    // The delta window of the queue that left is not the new queue's window.
    router.reset();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(router.callsTo(/tick/)[0].body?.since).toBeNull();
  });

  it("discards an answer that arrives after the desk unmounted", async () => {
    seed();
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    tickResponse = tickBody({
      deltas: { marks: [{ post_id: 2, curator: "riyat", state: "reviewed", updated_at: iso(0) }], flags: [], signals: [] },
    });
    router.on(/curation-desk\/tick/, async () => {
      await gate;
      return tickResponse;
    });
    const setQueryData = vi.spyOn(queryClient, "setQueryData");

    const { unmount } = renderHook(
      () => useCurationTick({ username: "curator1", enabled: true, feedKey, rows: [rowA, rowB], getVisibleIds: () => [1, 2] }),
      { wrapper }
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    // The viewer leaves the desk with the tick still in flight.
    unmount();
    await act(async () => {
      release?.();
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(setQueryData).not.toHaveBeenCalled();
    const after = queryClient.getQueryData<InfiniteData<CurationRosterFeedPage>>(feedKey)!;
    expect(after.pages[0].items[1].overlay).toBeNull();
  });

  it("merges deltas keeping identity for untouched rows and invalidates on truncated", async () => {
    seed();
    const before = queryClient.getQueryData<InfiniteData<CurationRosterFeedPage>>(feedKey)!;
    const untouched = before.pages[0].items[0];
    tickResponse = tickBody({
      deltas: {
        marks: [{ post_id: 2, curator: "riyat", state: "reviewed", updated_at: iso(0) }],
        flags: [],
        signals: [],
      },
    });
    renderHook(() => useCurationTick({ username: "curator1", enabled: true, feedKey, rows: [rowA, rowB], getVisibleIds: () => [1, 2] }), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    const after = queryClient.getQueryData<InfiniteData<CurationRosterFeedPage>>(feedKey)!;
    expect(after.pages[0].items[1].overlay?.team_mark).toBe("reviewed");
    expect(after.pages[0].items[0]).toBe(untouched);

    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    tickResponse = tickBody({ truncated: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: feedKey });
  });
});

describe("mergeTickIntoPages", () => {
  it("returns the same data when the tick carries nothing", () => {
    const data: InfiniteData<CurationRosterFeedPage> = { pages: [makeRosterPage([makeRow({ post_id: 1 })])], pageParams: [undefined] };
    expect(mergeTickIntoPages(data, tickBody())).toBe(data);
  });

  it("keeps a colleague's note body when a note-less delta updates their mark", () => {
    const withNote = makeRow({
      post_id: 1,
      overlay: makeOverlay({
        marks: [
          { curator: "riyat", state: "noted", note: "checked the sources", has_note: true, updated_at: iso(-60_000) },
        ],
        notes_count: 1,
      }),
    });
    const data: InfiniteData<CurationRosterFeedPage> = {
      pages: [makeRosterPage([withNote])],
      pageParams: [undefined],
    };
    const result = mergeTickIntoPages(
      data,
      tickBody({
        deltas: {
          // The delta carries has_note, never the body.
          marks: [{ post_id: 1, curator: "riyat", state: "flagged", reason: "ai_slop", has_note: true, updated_at: iso(0) }],
          flags: [],
          signals: [],
        },
      })
    )!;
    const [mark] = result.pages[0].items[0].overlay!.marks;
    expect(mark.state).toBe("flagged");
    expect(mark.note).toBe("checked the sources");
    expect(result.pages[0].items[0].overlay!.notes_count).toBe(1);
  });

  it("counts notes from has_note, not from the body the delta omitted", () => {
    const data: InfiniteData<CurationRosterFeedPage> = {
      pages: [makeRosterPage([makeRow({ post_id: 1, overlay: makeOverlay() })])],
      pageParams: [undefined],
    };
    const result = mergeTickIntoPages(
      data,
      tickBody({
        deltas: {
          marks: [
            { post_id: 1, curator: "riyat", state: "flagged", has_note: true, updated_at: iso(0) },
            { post_id: 1, curator: "seckorama", state: "reviewed", has_note: false, updated_at: iso(0) },
          ],
          flags: [],
          signals: [],
        },
      })
    )!;
    expect(result.pages[0].items[0].overlay!.notes_count).toBe(1);
  });

  it("fills a missing overlay from `overlay` and applies flags and signals deltas", () => {
    const data: InfiniteData<CurationRosterFeedPage> = {
      pages: [makeRosterPage([makeRow({ post_id: 1, overlay: null }), makeRow({ post_id: 2, overlay: makeOverlay() })])],
      pageParams: [undefined],
    };
    const result = mergeTickIntoPages(
      data,
      tickBody({
        overlay: [{ post_id: 1, ...makeOverlay({ notes_count: 2 }) }],
        deltas: {
          marks: [],
          flags: [{ post_id: 2, flags: { spaminator: true }, excluded_reason: null }],
          signals: [{ post_id: 2, signals: { formulaic: 71 } }],
        },
      })
    )!;
    expect(result.pages[0].items[0].overlay?.notes_count).toBe(2);
    expect(result.pages[0].items[1].overlay?.flags.spaminator).toBe(true);
    expect(result.pages[0].items[1].overlay?.signals?.formulaic).toBe(71);
  });
});

import { act, renderHook } from "@testing-library/react";
import type { InfiniteData } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CurationRosterFeedPage } from "@ecency/sdk";
import { makeRosterPage, makeRow, NOW } from "./curation-test-utils";

vi.mock("@ecency/sdk", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")) }));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  ensureValidToken: vi.fn(async () => "code-1"),
}));
vi.mock("@/core/hooks/use-active-username", () => ({ useActiveUsername: () => "curator1" }));

import { getCurationFeedInfiniteQueryOptions } from "@ecency/sdk";
import { buildQueueDisplay } from "@/features/curation-desk/curation-queue-display";
import { defaultQueueFilters, filtersToParams, rosterFeedQueryOptions, useQueueFilters } from "@/features/curation-desk/hooks";
import type { QueueFilters } from "@/features/curation-desk/types";

const hash = (key: unknown) => JSON.stringify(key);

describe("sort and filter chips", () => {
  afterEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  const chips: Array<[string, Partial<QueueFilters>]> = [
    ["Unreviewed only off", { unreviewedOnly: false }],
    ["Hide curated off", { hideCurated: false }],
    ["App", { app: "peakd" }],
    ["Community", { community: "hive-125125" }],
    ["New authors", { newAuthors: true }],
    ["Recommended", { recommended: true }],
    ["Flagged", { flagged: true }],
    ["Window", { window: "half" }],
    ["Words", { minWords: 600 }],
    ["Has images", { hasImages: true }],
    ["Rep", { repMin: 25, repMax: 75 }],
    ["Sort newest", { sort: "newest" }],
    ["Sort unique", { sort: "unique" }],
    ["Sort random", { sort: "random", seed: "abcd1234" }],
  ];

  it.each(chips)("%s changes the roster feed key (a new query, pages never mix)", (_name, patch) => {
    const base = rosterFeedQueryOptions("curator1", filtersToParams(defaultQueueFilters(), true)).queryKey;
    const changed = rosterFeedQueryOptions("curator1", filtersToParams({ ...defaultQueueFilters(), ...patch }, true)).queryKey;
    expect(hash(changed)).not.toBe(hash(base));
  });

  it("public filters ride on the public feed key and roster-only chips are dropped there", () => {
    const base = getCurationFeedInfiniteQueryOptions(filtersToParams(defaultQueueFilters(), false)).queryKey;
    const app = getCurationFeedInfiniteQueryOptions(filtersToParams({ ...defaultQueueFilters(), app: "ecency" }, false)).queryKey;
    expect(hash(app)).not.toBe(hash(base));
    const flagged = getCurationFeedInfiniteQueryOptions(filtersToParams({ ...defaultQueueFilters(), flagged: true, unreviewedOnly: false }, false)).queryKey;
    expect(hash(flagged)).toBe(hash(base));
    // Random is roster-only in v1: a public viewer falls back to newest.
    const random = filtersToParams({ ...defaultQueueFilters(), sort: "random", seed: "abcd1234" }, false);
    expect(random.sort).toBe("newest");
    expect(random.seed).toBeUndefined();
  });

  it("maps every chip to a server param and never filters rows client-side", () => {
    const params = filtersToParams({ ...defaultQueueFilters(), window: "half", minWords: 300, hasImages: true, community: "hive-125125", recommended: true }, true);
    expect(params).toMatchObject({ window: "half", min_words: 300, has_images: true, community: "hive-125125", recommended: true, hide_reviewed: true, hide_snoozed: true });
    // The display builder returns every served row, whatever the filters say.
    const rows = [makeRow({ post_id: 1 }), makeRow({ post_id: 2, word_count: 20 }), makeRow({ post_id: 3, image_count: 0 })];
    const display = buildQueueDisplay({ rows, teamCursor: null, sort: "queue", now: NOW, window: "half", expanded: { half: true, eighth: true, olderReviewed: true } });
    expect(display.items.filter((i) => i.type === "row")).toHaveLength(3);
  });

  it("generates the seed once per session and keeps it across a filter change", () => {
    const { result } = renderHook(() => useQueueFilters(true));
    const seed = result.current.filters.seed;
    expect(seed).toMatch(/^[a-z0-9]{8,16}$/);
    act(() => result.current.update({ app: "peakd" }));
    expect(result.current.filters.seed).toBe(seed);
    act(() => result.current.update({ sort: "random" }));
    expect(result.current.params.seed).toBe(seed);
    expect(window.sessionStorage.getItem("curation-desk-seed")).toBe(seed);

    const again = renderHook(() => useQueueFilters(true));
    expect(again.result.current.filters.seed).toBe(seed);
    act(() => result.current.reshuffle());
    expect(result.current.filters.seed).not.toBe(seed);
  });

  it("uses the role default sort until the viewer picks one, then persists the pick", () => {
    const roster = renderHook(() => useQueueFilters(true));
    expect(roster.result.current.filters.sort).toBe("queue");
    expect(roster.result.current.params).toMatchObject({ sort: "queue", hide_reviewed: true });
    const member = renderHook(() => useQueueFilters(false));
    expect(member.result.current.filters.sort).toBe("newest");
    expect(member.result.current.params).not.toHaveProperty("hide_reviewed");
    act(() => roster.result.current.update({ sort: "newest" }));
    expect(JSON.parse(window.localStorage.getItem("ecency_curation-desk-sort") ?? "null")).toBe("newest");
  });

  it("draws the team cursor divider only for the chronological sorts", () => {
    const cursor = { post_id: 5, created: new Date(NOW - 3_600_000).toISOString() };
    const rows = [makeRow({ post_id: 9 }), makeRow({ post_id: 4, created: new Date(NOW - 7_200_000).toISOString() })];
    const expanded = { half: false, eighth: false, olderReviewed: false };
    for (const sort of ["queue", "newest"] as const) {
      const display = buildQueueDisplay({ rows, teamCursor: cursor, sort, now: NOW, window: "all", expanded });
      expect(display.items.some((i) => i.type === "divider")).toBe(true);
      expect(display.chronological).toBe(true);
    }
    for (const sort of ["unique", "random"] as const) {
      const display = buildQueueDisplay({ rows, teamCursor: cursor, sort, now: NOW, window: "all", expanded });
      expect(display.items.some((i) => i.type === "divider")).toBe(false);
      const below = display.items.find((i) => i.type === "row" && i.row.post_id === 4);
      expect(below && below.type === "row" && below.belowCursor).toBe(true);
    }
  });

  it("merging two pages that share a post_id yields one row", () => {
    const options = rosterFeedQueryOptions("curator1", filtersToParams({ ...defaultQueueFilters(), sort: "unique" }, true));
    const shared = makeRow({ post_id: 7 });
    const data: InfiniteData<CurationRosterFeedPage> = {
      pages: [makeRosterPage([makeRow({ post_id: 8 }), shared]), makeRosterPage([shared, makeRow({ post_id: 6 })])],
      pageParams: [undefined, "c7"],
    };
    const merged = options.select(data);
    expect(merged.pages.flatMap((p) => p.items.map((r) => r.post_id))).toEqual([8, 7, 6]);
  });
});

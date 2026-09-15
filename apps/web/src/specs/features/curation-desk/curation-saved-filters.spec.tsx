import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ username: "curator1" as string | undefined }));

vi.mock("@ecency/sdk", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")) }));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  ensureValidToken: vi.fn(async () => "code-1"),
}));
vi.mock("@/core/hooks/use-active-username", () => ({ useActiveUsername: () => state.username }));

import { FILTERS_STORAGE_KEY } from "@/features/curation-desk/consts";
import {
  pickSavedFilters,
  readSavedFilters,
  sanitizeSavedFilters,
  saveFilters,
} from "@/features/curation-desk/curation-filter-storage";
import { defaultQueueFilters, useQueueFilters } from "@/features/curation-desk/hooks";

const KEY = `ecency_${FILTERS_STORAGE_KEY}`;

function stored() {
  const raw = window.localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
}

describe("saved refine filters", () => {
  beforeEach(() => {
    state.username = "curator1";
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  describe("sanitizeSavedFilters", () => {
    it("drops one bad field and keeps the rest of the lane", () => {
      expect(
        sanitizeSavedFilters({ app: "not-an-app", community: "hive-125125", hasImages: true })
      ).toEqual({ community: "hive-125125", hasImages: true });
    });

    it("refuses a community the backend would reject", () => {
      expect(sanitizeSavedFilters({ community: "hive-12" })).toEqual({});
      expect(sanitizeSavedFilters({ community: "../etc" })).toEqual({});
    });

    /**
     * The two word selects do not clamp each other, so `min > max` is
     * reachable. It matches nothing on the server, so persisting it would
     * hand the curator a permanently empty queue.
     */
    it("drops an inverted word range whole", () => {
      expect(sanitizeSavedFilters({ minWords: 1000, maxWords: 300 })).toEqual({});
      expect(sanitizeSavedFilters({ minWords: 300, maxWords: 1000 })).toEqual({
        minWords: 300,
        maxWords: 1000,
      });
    });

    it("restores the reputation range as a pair or not at all", () => {
      expect(sanitizeSavedFilters({ repMin: 25 })).toEqual({});
      expect(sanitizeSavedFilters({ repMin: 75, repMax: 25 })).toEqual({});
      expect(sanitizeSavedFilters({ repMin: 25, repMax: 75 })).toEqual({ repMin: 25, repMax: 75 });
    });

    it("takes nothing from a non-object, an array or a wrongly typed value", () => {
      expect(sanitizeSavedFilters(null)).toEqual({});
      expect(sanitizeSavedFilters([{ app: "peakd" }])).toEqual({});
      expect(sanitizeSavedFilters({ hasImages: "yes", repMin: "1" })).toEqual({});
    });
  });

  describe("pickSavedFilters", () => {
    const defaults = defaultQueueFilters();

    it("stores only what differs, so the null sentinels stay absent", () => {
      expect(pickSavedFilters(defaults, defaults, true)).toEqual({});
      expect(pickSavedFilters({ ...defaults, app: "peakd" }, defaults, true)).toEqual({ app: "peakd" });
    });

    /**
     * `unreviewedOnly` resolves from the role, so it is compared resolved.
     * Toggling the chip off and on lands on the literal `true`, which IS the
     * roster default: storing that would advertise a filter nothing counts.
     */
    it("compares unreviewedOnly against the role default, not the raw sentinel", () => {
      expect(pickSavedFilters({ ...defaults, unreviewedOnly: true }, defaults, true)).toEqual({});
      expect(pickSavedFilters({ ...defaults, unreviewedOnly: false }, defaults, true)).toEqual({
        unreviewedOnly: false,
      });
    });

    it("keeps the reputation range together", () => {
      expect(pickSavedFilters({ ...defaults, repMin: 25 }, defaults, true)).toEqual({
        repMin: 25,
        repMax: 100,
      });
    });

    it("never carries the moderation lenses, the sort or the session seed", () => {
      const picked = pickSavedFilters(
        { ...defaults, flagged: true, excluded: true, sort: "newest", seed: "abcd1234" },
        defaults,
        true
      );
      expect(picked).toEqual({});
    });

    /**
     * The window was left out at first because it also collapses the weight
     * tails. Curators asked for it back on the first day, and Reset is on
     * screen whenever any filter is on.
     */
    it("carries the window, and only a window the backend knows", () => {
      expect(pickSavedFilters({ ...defaults, window: "full" }, defaults, true)).toEqual({});
      expect(pickSavedFilters({ ...defaults, window: "all" }, defaults, true)).toEqual({ window: "all" });
      expect(pickSavedFilters({ ...defaults, window: "12h" }, defaults, true)).toEqual({ window: "12h" });
      expect(sanitizeSavedFilters({ window: "full" })).toEqual({ window: "full" });
      expect(sanitizeSavedFilters({ window: "12h" })).toEqual({ window: "12h" });
      expect(sanitizeSavedFilters({ window: "yesterday" })).toEqual({});
    });
  });

  describe("saveFilters", () => {
    it("writes per account and reads back only that account's set", () => {
      saveFilters("curator1", { app: "peakd" });
      saveFilters("curator2", { hasImages: true });
      expect(readSavedFilters("curator1")).toEqual({ app: "peakd" });
      expect(readSavedFilters("curator2")).toEqual({ hasImages: true });
    });

    it("removes the whole key once the last account clears its set", () => {
      saveFilters("curator1", { app: "peakd" });
      saveFilters("curator1", {});
      expect(stored()).toBeNull();
    });

    it("ignores a record written under another version", () => {
      window.localStorage.setItem(KEY, JSON.stringify({ v: 99, users: { curator1: { filters: { app: "peakd" } } } }));
      expect(readSavedFilters("curator1")).toEqual({});
    });

    /**
     * Version 1 was written while "All windows" was the default, so its window
     * is dropped once and the account opens under 24 h like everyone else. The
     * rest of the lane survives, and the next save writes version 2.
     */
    it("reads a version 1 record without its window and keeps the rest", () => {
      window.localStorage.setItem(
        KEY,
        JSON.stringify({
          v: 1,
          users: {
            curator1: { filters: { app: "peakd", window: "half" } },
            curator2: { filters: { window: "12h" } },
            // Malformed entries pass through untouched and restore nothing.
            curator3: { filters: null },
            curator4: { filters: ["peakd"] },
            curator5: "garbage",
          },
        })
      );
      expect(readSavedFilters("curator1")).toEqual({ app: "peakd" });
      expect(readSavedFilters("curator2")).toEqual({});
      for (const owner of ["curator3", "curator4", "curator5"]) expect(readSavedFilters(owner)).toEqual({});

      saveFilters("curator2", { hasImages: true });
      expect(stored()).toEqual({
        v: 2,
        users: {
          curator1: { filters: { app: "peakd" } },
          curator2: { filters: { hasImages: true } },
          curator3: { filters: null },
          curator4: { filters: ["peakd"] },
          curator5: "garbage",
        },
      });
    });

    it("stores nothing for a viewer with no account", () => {
      saveFilters(null, { app: "peakd" });
      expect(stored()).toBeNull();
    });
  });

  describe("useQueueFilters", () => {
    it("restores a saved set on mount and only then reports restored", async () => {
      saveFilters("curator1", { app: "peakd", hasImages: true });

      const { result } = renderHook(() => useQueueFilters(true));

      await waitFor(() => expect(result.current.restored).toBe(true));
      expect(result.current.filters.app).toBe("peakd");
      expect(result.current.filters.hasImages).toBe(true);
      expect(result.current.params.app).toBe("peakd");
      expect(result.current.savedOwner).toBe("curator1");
    });

    it("writes a change back, and Reset clears the stored copy too", async () => {
      const { result } = renderHook(() => useQueueFilters(true));
      await waitFor(() => expect(result.current.restored).toBe(true));
      // The restore itself must not write: only a change the curator made does.
      expect(stored()).toBeNull();

      act(() => result.current.update({ app: "peakd" }));
      await waitFor(() => expect(readSavedFilters("curator1")).toEqual({ app: "peakd" }));

      act(() => result.current.reset());
      await waitFor(() => expect(stored()).toBeNull());
      expect(result.current.savedOwner).toBeNull();
    });

    /**
     * The sort keeps its own shipped key, so saving a view and persisting the
     * order stay two independent mechanisms.
     */
    it("leaves the sort out of the saved set", async () => {
      const { result } = renderHook(() => useQueueFilters(true));
      await waitFor(() => expect(result.current.restored).toBe(true));

      act(() => result.current.update({ sort: "newest" }));

      await waitFor(() => expect(window.localStorage.getItem("ecency_curation-desk-order")).toBe('"newest"'));
      expect(stored()).toBeNull();
    });

    it("keeps a restored member set usable once the same viewer is on the roster", async () => {
      saveFilters("curator1", { app: "peakd" });

      const { result } = renderHook(() => useQueueFilters(false));
      await waitFor(() => expect(result.current.restored).toBe(true));

      // The role defaults still resolve from the role, not from a frozen value.
      expect(result.current.filters.sort).toBe("queue");
      expect(result.current.filters.unreviewedOnly).toBe(false);
      expect(result.current.filters.app).toBe("peakd");
    });

    /**
     * Signing in from an anonymous visit keeps what is on screen. Switching
     * between two accounts must not: applying one curator's lane under
     * another's name would then be saved into their entry on the next edit.
     */
    it("carries filters forward when an anonymous visit signs in", async () => {
      state.username = undefined;
      const { result, rerender } = renderHook(() => useQueueFilters(true));
      await waitFor(() => expect(result.current.restored).toBe(true));
      act(() => result.current.update({ app: "peakd" }));

      state.username = "curator1";
      rerender();

      await waitFor(() => expect(result.current.restored).toBe(true));
      expect(result.current.filters.app).toBe("peakd");
    });

    it("does not let one account inherit or save another account's lane", async () => {
      saveFilters("curator1", { app: "peakd" });
      const { result, rerender } = renderHook(() => useQueueFilters(true));
      await waitFor(() => expect(result.current.filters.app).toBe("peakd"));

      state.username = "curator2";
      rerender();

      await waitFor(() => expect(result.current.restoredFor).toBe("curator2"));
      // curator2 has nothing saved, so they get the defaults, not peakd, and
      // the request params follow: `restored` is derived from whose filters
      // are applied, so the feeds cannot fetch under the old account's set.
      expect(result.current.filters.app).toBe("all");
      expect(result.current.params.app).toBe("all");
      expect(result.current.restored).toBe(true);
      expect(result.current.savedOwner).toBeNull();
      // and a later edit is stored under curator2 alone
      act(() => result.current.update({ hasImages: true }));
      await waitFor(() => expect(readSavedFilters("curator2")).toEqual({ hasImages: true }));
      expect(readSavedFilters("curator1")).toEqual({ app: "peakd" });
    });

    it("restores for the account the store has not published yet", async () => {
      saveFilters("curator1", { app: "ecency" });
      state.username = undefined;
      window.localStorage.setItem("ecency_active_user", JSON.stringify("curator1"));

      const { result } = renderHook(() => useQueueFilters(true));

      await waitFor(() => expect(result.current.restored).toBe(true));
      expect(result.current.filters.app).toBe("ecency");
    });
  });
});

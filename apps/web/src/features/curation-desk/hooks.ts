"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";
import {
  QueryKeys,
  dedupeCurationPages,
  fetchCurationFeedPage,
  getCurationFeedInfiniteQueryOptions,
  getCurationRosterQueryOptions,
  getCurationStatusQueryOptions,
  normalizeCurationParams,
  type CurationActiveCurator,
  type CurationCursorInput,
  type CurationDismissAction,
  type CurationFeedPage,
  type CurationFeedParams,
  type CurationMarkState,
  type CurationRosterFeedPage,
  type CurationRosterFeedParams,
  type CurationSort,
  type CurationStatus,
  type CurationTeamCursor,
  type CurationTickResponse,
} from "@ecency/sdk";
import { useActiveUsername } from "@/core/hooks/use-active-username";
import * as ls from "@/utils/local-storage";
import {
  IDLE_MS,
  MY_MARKS_KEY_SUFFIX,
  POLL_MS_CURATOR,
  POLL_MS_PUBLIC,
  QUEUE_PAGE_SIZE,
  SEED_STORAGE_KEY,
  SORT_STORAGE_KEY,
} from "./consts";
import { curationDeskApi } from "./curation-desk-api";
import { mergeTickIntoPages, replaceRowInPages } from "./curation-tick-merge";
import type { DeskRow, MarkActionInput, QueueFilters, ResolvedQueueFilters, ViewerRole } from "./types";

// ---------------------------------------------------------------------------
// Role
// ---------------------------------------------------------------------------

export function useViewerRole(): ViewerRole {
  const username = useActiveUsername();
  const roster = useQuery({ ...getCurationRosterQueryOptions(), enabled: !!username });
  return useMemo<ViewerRole>(() => {
    if (!username) {
      return {
        username,
        kind: "anon",
        role: null,
        isRoster: false,
        isTrial: false,
        canRewindCursor: false,
        isLoading: false,
      };
    }
    const entry = roster.data?.curators.find((c) => c.username === username && c.active !== false);
    const role = entry?.role ?? null;
    return {
      username,
      kind: role ? "roster" : "member",
      role,
      isRoster: !!role,
      isTrial: role === "trial",
      canRewindCursor: role === "mod" || role === "admin",
      isLoading: roster.isLoading,
    };
  }, [username, roster.data, roster.isLoading]);
}

// ---------------------------------------------------------------------------
// Feeds
// ---------------------------------------------------------------------------

export function useCurationStatus(enabled = true) {
  return useQuery({ ...getCurationStatusQueryOptions(), enabled });
}

export function useCurationFeed(params: CurationFeedParams, enabled = true) {
  return useInfiniteQuery({ ...getCurationFeedInfiniteQueryOptions(params), enabled });
}

/** Prefix that matches every roster feed of one curator, whatever the filters. */
export function rosterFeedPrefix(username: string | undefined): QueryKey {
  return QueryKeys.curation.rosterFeed(username).slice(0, 3);
}

/**
 * Authed roster feed. Web-owned so its queryFn can await ensureValidToken on
 * every page (a builder with a static code is the expired token trap). Every
 * sort and filter value sits on the key, so a change starts a new query and
 * never mixes pages.
 */
export function rosterFeedQueryOptions(username: string | undefined, params: CurationRosterFeedParams) {
  const limit = params.limit ?? QUEUE_PAGE_SIZE;
  const withLimit = { ...params, limit };
  const normalized = normalizeCurationParams(withLimit);
  return {
    queryKey: QueryKeys.curation.rosterFeed(username, normalized),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }: { pageParam?: string; signal?: AbortSignal }) =>
      curationDeskApi.rosterFeed(username, withLimit, pageParam, signal),
    getNextPageParam: (lastPage: CurationRosterFeedPage): string | undefined => {
      if (!lastPage || lastPage.items.length < limit) return undefined;
      const last = lastPage.items[lastPage.items.length - 1];
      return last?._cursor ?? lastPage.next_cursor ?? undefined;
    },
    select: dedupeCurationPages<CurationRosterFeedPage>,
    staleTime: 10_000,
  };
}

export function useCurationRosterFeed(
  username: string | undefined,
  params: CurationRosterFeedParams,
  enabled = true
) {
  return useInfiniteQuery({ ...rosterFeedQueryOptions(username, params), enabled: enabled && !!username });
}

// ---------------------------------------------------------------------------
// Tick (roster)
// ---------------------------------------------------------------------------

let lastActivityAt = Date.now();
export function noteCuratorActivity() {
  lastActivityAt = Date.now();
}

export interface TickOptions {
  username: string | undefined;
  enabled: boolean;
  feedKey: QueryKey;
  rows: DeskRow[];
  getVisibleIds: () => number[];
}

export interface TickState {
  teamCursor: CurationTeamCursor | null;
  activeCurators: CurationActiveCurator[];
  trailAlerts: unknown[];
  /** The last tick failed; the loaded queue stays, live updates are paused. */
  paused: boolean;
  lastTickAt: number | null;
  tickNow: () => Promise<void>;
}

/**
 * 15 s delta loop while visible, rows are loaded and the curator was active
 * in the last 10 min. `since` is the previous response's `generated_at`
 * echoed verbatim (never the client clock). Deltas merge with an identity
 * preserving Map; `truncated` invalidates the feed.
 */
export function useCurationTick(options: TickOptions): TickState {
  const { username, enabled, feedKey } = options;
  const queryClient = useQueryClient();
  const rowsRef = useRef(options.rows);
  rowsRef.current = options.rows;
  const visibleRef = useRef(options.getVisibleIds);
  visibleRef.current = options.getVisibleIds;
  const sinceRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const feedKeyRef = useRef(feedKey);
  feedKeyRef.current = feedKey;

  const [state, setState] = useState<Omit<TickState, "tickNow">>({
    teamCursor: null,
    activeCurators: [],
    trailAlerts: [],
    paused: false,
    lastTickAt: null,
  });

  const tickNow = useCallback(async () => {
    if (!enabled || !username || inFlightRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const rows = rowsRef.current;
    if (rows.length === 0) return;
    if (Date.now() - lastActivityAt > IDLE_MS) return;

    const visible = visibleRef.current().slice(0, 100);
    const need = rows.filter((r) => r.overlay == null).map((r) => r.post_id).slice(0, 100);
    inFlightRef.current = true;
    try {
      const response: CurationTickResponse = await curationDeskApi.tick(username, {
        since: sinceRef.current,
        need,
        visible,
      });
      sinceRef.current = response.generated_at ?? sinceRef.current;
      queryClient.setQueryData<InfiniteData<CurationRosterFeedPage, unknown>>(feedKeyRef.current, (old) =>
        mergeTickIntoPages(old, response)
      );
      if (response.truncated) {
        queryClient.invalidateQueries({ queryKey: feedKeyRef.current });
      }
      setState({
        teamCursor: response.team_cursor ?? null,
        activeCurators: response.active_curators ?? [],
        trailAlerts: response.trail_alerts ?? [],
        paused: false,
        lastTickAt: Date.now(),
      });
    } catch {
      setState((prev) => ({ ...prev, paused: true }));
    } finally {
      inFlightRef.current = false;
    }
  }, [enabled, username, queryClient]);

  useEffect(() => {
    if (!enabled || !username) return;
    const interval = setInterval(() => void tickNow(), POLL_MS_CURATOR);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tickNow();
    };
    const onActivity = () => noteCuratorActivity();
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("keydown", onActivity, { passive: true });
    document.addEventListener("pointerdown", onActivity, { passive: true });
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("keydown", onActivity);
      document.removeEventListener("pointerdown", onActivity);
    };
  }, [enabled, username, tickNow]);

  // A new feed key (filters changed) starts a fresh delta window.
  useEffect(() => {
    sinceRef.current = null;
  }, [feedKey]);

  return { ...state, tickNow };
}

// ---------------------------------------------------------------------------
// Public status poll: page 1 refetched only when feed_version changed
// ---------------------------------------------------------------------------

export interface StatusPollOptions {
  enabled: boolean;
  feedKey: QueryKey;
  fetchPageOne: (signal?: AbortSignal) => Promise<CurationFeedPage | CurationRosterFeedPage>;
}

/**
 * `status` every 60 s while visible. Feed page 1 is fetched into a separate
 * `latest` key ONLY when `feed_version` or `latest_post_id` moved, then
 * swapped in with setQueryData (structural sharing keeps untouched rows).
 */
export function useStatusPoll({ enabled, feedKey, fetchPageOne }: StatusPollOptions) {
  const queryClient = useQueryClient();
  const versionRef = useRef<string | null>(null);
  const feedKeyRef = useRef(feedKey);
  feedKeyRef.current = feedKey;
  const fetchRef = useRef(fetchPageOne);
  fetchRef.current = fetchPageOne;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const poll = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      let status: CurationStatus;
      try {
        status = await queryClient.fetchQuery({ ...getCurationStatusQueryOptions(), staleTime: 0 });
      } catch {
        return;
      }
      if (cancelled) return;
      const version = `${status.feed_version ?? ""}|${status.latest_post_id ?? ""}`;
      if (versionRef.current === null) {
        versionRef.current = version;
        return;
      }
      if (versionRef.current === version) return;
      versionRef.current = version;
      try {
        const page = await queryClient.fetchQuery({
          queryKey: [...feedKeyRef.current, "latest"],
          queryFn: ({ signal }) => fetchRef.current(signal),
          staleTime: 0,
          gcTime: 0,
        });
        if (cancelled) return;
        queryClient.setQueryData<InfiniteData<CurationFeedPage | CurationRosterFeedPage, unknown>>(
          feedKeyRef.current,
          (old) => (old ? { ...old, pages: [page, ...old.pages.slice(1)] } : old)
        );
      } catch {
        // The loaded queue stays; the next poll tries again.
      }
    };

    const interval = setInterval(poll, POLL_MS_PUBLIC);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, queryClient]);

  useEffect(() => {
    versionRef.current = null;
  }, [feedKey]);
}

/** Page 1 fetcher for the public feed, for `useStatusPoll`. */
export function publicPageOneFetcher(params: CurationFeedParams) {
  return (signal?: AbortSignal) => fetchCurationFeedPage({ ...params, limit: params.limit ?? QUEUE_PAGE_SIZE }, undefined, signal);
}

// ---------------------------------------------------------------------------
// Marks, cursor, dismiss
// ---------------------------------------------------------------------------

function patchRosterRow(queryClient: ReturnType<typeof useQueryClient>, username: string | undefined, row: DeskRow) {
  queryClient.setQueriesData<InfiniteData<CurationRosterFeedPage, unknown>>(
    { queryKey: rosterFeedPrefix(username) },
    (old) => replaceRowInPages(old, row)
  );
}

export function myMarksKey(username: string | undefined, state?: CurationMarkState): QueryKey {
  return [...QueryKeys.curation._prefix, MY_MARKS_KEY_SUFFIX, username, state ?? "all"];
}

/** r / z / f / n: one POST through the memoized ValidateCode, one PG round trip. */
export function useCurationMark() {
  const username = useActiveUsername();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [...QueryKeys.curation._prefix, "mark", username],
    mutationFn: async (input: MarkActionInput) => {
      noteCuratorActivity();
      return curationDeskApi.mark(username, {
        author: input.row.author,
        permlink: input.row.permlink,
        state: input.state,
        reason: input.reason,
        note: input.note,
        snooze_until: input.snooze_until,
      });
    },
    onSuccess: (response) => {
      if (response?.row) patchRosterRow(queryClient, username, response.row);
      queryClient.invalidateQueries({ queryKey: [...QueryKeys.curation._prefix, MY_MARKS_KEY_SUFFIX, username] });
    },
  });
}

export function useClearMark() {
  const username = useActiveUsername();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [...QueryKeys.curation._prefix, "mark-clear", username],
    mutationFn: async (row: Pick<DeskRow, "author" | "permlink">) => {
      noteCuratorActivity();
      return curationDeskApi.markClear(username, { author: row.author, permlink: row.permlink });
    },
    onSuccess: (response) => {
      if (response?.row) patchRosterRow(queryClient, username, response.row);
      queryClient.invalidateQueries({ queryKey: [...QueryKeys.curation._prefix, MY_MARKS_KEY_SUFFIX, username] });
    },
  });
}

export function useSetCursor() {
  const username = useActiveUsername();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [...QueryKeys.curation._prefix, "cursor", username],
    mutationFn: async (input: CurationCursorInput) => {
      noteCuratorActivity();
      return curationDeskApi.cursor(username, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.curation.status() });
    },
  });
}

export function useCurationDismissReco() {
  const username = useActiveUsername();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [...QueryKeys.curation._prefix, "reco-dismiss", username],
    mutationFn: async (input: { author: string; permlink: string; action: CurationDismissAction }) => {
      noteCuratorActivity();
      return curationDeskApi.dismissReco(username, input);
    },
    onSuccess: (response, variables) => {
      if (response?.row) patchRosterRow(queryClient, username, response.row);
      queryClient.invalidateQueries({ queryKey: QueryKeys.curation._recommendationsPrefix });
      queryClient.invalidateQueries({ queryKey: QueryKeys.curation.post(variables.author, variables.permlink) });
    },
  });
}

/** My marks (web-owned useQuery; the queryFn awaits ensureValidToken). */
export function useMyMarks(state: CurationMarkState | undefined, enabled = true) {
  const username = useActiveUsername();
  return useQuery({
    queryKey: myMarksKey(username, state),
    enabled: enabled && !!username,
    queryFn: ({ signal }) => curationDeskApi.myMarks(username, { state, limit: 50 }, signal),
    staleTime: 15_000,
  });
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export function defaultQueueFilters(): QueueFilters {
  return {
    sort: null,
    seed: "",
    unreviewedOnly: null,
    hideCurated: true,
    app: "all",
    community: "",
    newAuthors: false,
    recommended: false,
    flagged: false,
    window: "all",
    minWords: null,
    maxWords: null,
    hasImages: false,
    repMin: 0,
    repMax: 100,
  };
}

/**
 * Role defaults resolve synchronously from `isRoster`, so the first roster
 * feed request already carries sort=queue and hide_reviewed once the roster
 * lookup has answered, with no second fetch to correct it.
 */
export function resolveFilters(filters: QueueFilters, isRoster: boolean): ResolvedQueueFilters {
  const sort: CurationSort = filters.sort ?? (isRoster ? "queue" : "newest");
  return {
    ...filters,
    sort: !isRoster && sort === "random" ? "newest" : sort,
    unreviewedOnly: filters.unreviewedOnly ?? isRoster,
  };
}

export function makeSeed(): string {
  let seed = "";
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 12; i++) seed += alphabet[Math.floor(Math.random() * alphabet.length)];
  return seed;
}

function readSessionSeed(): string {
  try {
    const existing = window.sessionStorage.getItem(SEED_STORAGE_KEY);
    if (existing && /^[a-z0-9]{8,16}$/.test(existing)) return existing;
    const seed = makeSeed();
    window.sessionStorage.setItem(SEED_STORAGE_KEY, seed);
    return seed;
  } catch {
    return makeSeed();
  }
}

const SORTS: CurationSort[] = ["queue", "newest", "unique", "random"];

/** Every chip maps to a server param; nothing here filters rows client-side. */
export function filtersToParams(input: QueueFilters, isRoster: boolean): CurationRosterFeedParams {
  const filters = resolveFilters(input, isRoster);
  const sort = filters.sort;
  const params: CurationRosterFeedParams = {
    sort,
    app: filters.app,
    community: filters.community || undefined,
    window: filters.window,
    min_words: filters.minWords ?? undefined,
    max_words: filters.maxWords ?? undefined,
    has_images: filters.hasImages,
    new_authors: filters.newAuthors,
    recommended: filters.recommended || sort === "unique",
    hide_curated: filters.hideCurated,
    limit: QUEUE_PAGE_SIZE,
  };
  if (filters.repMin > 0) params.rep_min = filters.repMin;
  if (filters.repMax < 100) params.rep_max = filters.repMax;
  if (isRoster) {
    params.flagged = filters.flagged || undefined;
    params.hide_reviewed = filters.unreviewedOnly;
    params.hide_snoozed = filters.unreviewedOnly;
    if (sort === "random") params.seed = filters.seed;
  }
  return params;
}

export function useQueueFilters(isRoster: boolean) {
  const [filters, setFilters] = useState<QueueFilters>(defaultQueueFilters);

  // Browser-only state after mount: the persisted sort (per viewer, try/catch)
  // and the session seed, generated once per browser session.
  useEffect(() => {
    let persisted: CurationSort | null = null;
    try {
      const stored = ls.get(SORT_STORAGE_KEY);
      if (typeof stored === "string" && SORTS.includes(stored as CurationSort)) persisted = stored as CurationSort;
    } catch {
      persisted = null;
    }
    const seed = readSessionSeed();
    setFilters((prev) => (prev.sort === persisted && prev.seed === seed ? prev : { ...prev, sort: prev.sort ?? persisted, seed }));
  }, []);

  const update = useCallback((patch: Partial<QueueFilters>) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      if (patch.sort && patch.sort !== prev.sort) {
        try {
          ls.set(SORT_STORAGE_KEY, patch.sort);
        } catch {
          // Storage may be unavailable; the choice still applies for this page.
        }
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setFilters((prev) => ({ ...defaultQueueFilters(), sort: prev.sort, seed: prev.seed }));
  }, []);

  const reshuffle = useCallback(() => {
    const seed = makeSeed();
    try {
      window.sessionStorage.setItem(SEED_STORAGE_KEY, seed);
    } catch {
      // ignore
    }
    setFilters((prev) => ({ ...prev, seed }));
  }, []);

  const resolved = useMemo(() => resolveFilters(filters, isRoster), [filters, isRoster]);
  const params = useMemo(() => filtersToParams(filters, isRoster), [filters, isRoster]);
  const activeCount = useMemo(() => countActiveFilters(filters, isRoster), [filters, isRoster]);

  return { filters: resolved, params, update, reset, reshuffle, activeCount };
}

export function countActiveFilters(input: QueueFilters, isRoster: boolean): number {
  const filters = resolveFilters(input, isRoster);
  const defaults = resolveFilters(defaultQueueFilters(), isRoster);
  let n = 0;
  if (filters.app !== defaults.app) n++;
  if (filters.community) n++;
  if (filters.newAuthors) n++;
  if (filters.recommended) n++;
  if (isRoster && filters.flagged) n++;
  if (filters.window !== "all") n++;
  if (filters.minWords != null || filters.maxWords != null) n++;
  if (filters.hasImages) n++;
  if (filters.repMin > 0 || filters.repMax < 100) n++;
  if (filters.hideCurated !== defaults.hideCurated) n++;
  if (isRoster && filters.unreviewedOnly !== defaults.unreviewedOnly) n++;
  return n;
}

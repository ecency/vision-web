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
  fetchCurationFeedPage,
  getCurationFeedInfiniteQueryOptions,
  getCurationRosterQueryOptions,
  getCurationStatusQueryOptions,
  normalizeCurationParams,
  selectCurationFeedPages,
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
    // The public feed's select: same dedupe, same takedown masking.
    select: selectCurationFeedPages<CurationRosterFeedPage>,
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
  /**
   * `generated_at` of the loaded feed page. It seeds the delta window, so the
   * first tick asks for what changed since the page was built instead of
   * asking for everything with `since: null`.
   */
  feedGeneratedAt?: string | null;
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
 * echoed verbatim (never the client clock), seeded from the loaded feed page
 * so the first tick already carries one. Deltas merge with an identity
 * preserving Map; `truncated` invalidates the feed, but only for a request
 * that named a window: a `since: null` tick asks for a snapshot, so treating
 * its answer as truncated would refetch the whole queue on every mount.
 */
export function useCurationTick(options: TickOptions): TickState {
  const { username, enabled, feedKey } = options;
  const queryClient = useQueryClient();
  const rowsRef = useRef(options.rows);
  rowsRef.current = options.rows;
  const visibleRef = useRef(options.getVisibleIds);
  visibleRef.current = options.getVisibleIds;
  const feedGeneratedAtRef = useRef(options.feedGeneratedAt);
  feedGeneratedAtRef.current = options.feedGeneratedAt;
  const sinceRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const feedKeyRef = useRef(feedKey);
  feedKeyRef.current = feedKey;
  /**
   * Bumped whenever the queue changes. A tick that started under an older
   * generation answers about a queue nobody is reading any more, so its rows,
   * its cursor and its delta window all belong to the feed that left.
   */
  const generationRef = useRef(0);

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
    const since = sinceRef.current ?? feedGeneratedAtRef.current ?? null;
    // Captured at the start of the request, never read back off the refs
    // around the await: the account or the filters may change while the tick
    // is in flight, so the answer describes the queue that asked for it.
    const generation = generationRef.current;
    const key = feedKeyRef.current;
    inFlightRef.current = true;
    try {
      const response: CurationTickResponse = await curationDeskApi.tick(username, {
        since,
        need,
        visible,
      });
      if (generation !== generationRef.current) return;
      sinceRef.current = response.generated_at ?? sinceRef.current;
      queryClient.setQueryData<InfiniteData<CurationRosterFeedPage, unknown>>(key, (old) =>
        mergeTickIntoPages(old, response)
      );
      if (response.truncated && since !== null) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      setState({
        teamCursor: response.team_cursor ?? null,
        activeCurators: response.active_curators ?? [],
        trailAlerts: response.trail_alerts ?? [],
        paused: false,
        lastTickAt: Date.now(),
      });
    } catch {
      if (generation !== generationRef.current) return;
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

  // A new feed key (filters changed) starts a fresh delta window; every tick
  // still in flight belongs to the window that just ended. Unmounting ends a
  // window the same way, so the cleanup bumps the generation too: an answer
  // that lands after the desk is gone has no queue left to write to.
  useEffect(() => {
    generationRef.current += 1;
    sinceRef.current = null;
    return () => {
      generationRef.current += 1;
    };
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
  /**
   * `feed_version` of the loaded page one. It seeds the baseline, so a head
   * that moved between the page load and the first poll still refreshes. The
   * roster feed carries no version, so there the first poll is the baseline.
   */
  feedVersion?: string | null;
}

/** What the poll compares. A null `latestPostId` means "not observed yet". */
interface FeedHeadVersion {
  feedVersion: string | null;
  latestPostId: number | null;
}

function statusHeadVersion(status: CurationStatus): FeedHeadVersion {
  return { feedVersion: status.feed_version ?? null, latestPostId: status.latest_post_id ?? null };
}

/** A part nobody has observed yet says nothing, so it never counts as a move. */
function headVersionMoved(previous: FeedHeadVersion, next: FeedHeadVersion): boolean {
  if (previous.feedVersion !== next.feedVersion) return true;
  if (previous.latestPostId == null || next.latestPostId == null) return false;
  return previous.latestPostId !== next.latestPostId;
}

/**
 * `status` every 60 s while visible. Feed page 1 is fetched into a separate
 * `latest` key ONLY when `feed_version` or `latest_post_id` moved, then
 * swapped in with setQueryData (structural sharing keeps untouched rows).
 *
 * The version is committed only once a page was installed, so a failed refresh
 * leaves the change for the next poll instead of consuming it. Key, fetcher and
 * a generation are captured when the request starts: an answer that arrives
 * after the filters or the account changed belongs to the queue that left.
 * Overlapping interval and visibilitychange polls share one in-flight promise.
 */
export function useStatusPoll({ enabled, feedKey, fetchPageOne, feedVersion }: StatusPollOptions) {
  const queryClient = useQueryClient();
  const versionRef = useRef<FeedHeadVersion | null>(null);
  const feedKeyRef = useRef(feedKey);
  feedKeyRef.current = feedKey;
  const fetchRef = useRef(fetchPageOne);
  fetchRef.current = fetchPageOne;
  const feedVersionRef = useRef(feedVersion);
  feedVersionRef.current = feedVersion;
  const generationRef = useRef(0);
  const inFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const run = async () => {
      const generation = generationRef.current;
      const key = feedKeyRef.current;
      const fetchPage = fetchRef.current;
      let status: CurationStatus;
      try {
        status = await queryClient.fetchQuery({ ...getCurationStatusQueryOptions(), staleTime: 0 });
      } catch {
        return;
      }
      if (generation !== generationRef.current) return;
      const next = statusHeadVersion(status);
      const baseline =
        versionRef.current ??
        (typeof feedVersionRef.current === "string"
          ? { feedVersion: feedVersionRef.current, latestPostId: null }
          : null);
      // Nothing to refresh: recording what status says costs nothing and fills
      // the half a loaded page could not seed.
      if (!baseline || !headVersionMoved(baseline, next)) {
        versionRef.current = next;
        return;
      }
      // Page one is missing, or it is in flight and was asked for under the
      // older head. Recording the version here would consume a change the
      // page that lands next may not carry, so the poll leaves it: the next
      // one reads the same change against a queue that is actually there.
      const feedState = queryClient.getQueryState(key);
      if (!feedState || feedState.data === undefined || feedState.fetchStatus === "fetching") {
        return;
      }
      try {
        const page = await queryClient.fetchQuery({
          queryKey: [...key, "latest"],
          queryFn: ({ signal }) => fetchPage(signal),
          staleTime: 0,
          gcTime: 0,
        });
        if (generation !== generationRef.current) return;
        queryClient.setQueryData<InfiniteData<CurationFeedPage | CurationRosterFeedPage, unknown>>(
          key,
          // Later pages continue from a cursor the old head produced, so
          // keeping them behind a refreshed head leaves a hole where the head
          // grew. The refreshed page is the queue again and pagination
          // continues from its own cursor; scroll position is best effort.
          (old) => (old ? { ...old, pages: [page], pageParams: old.pageParams.slice(0, 1) } : old)
        );
        versionRef.current = next;
      } catch {
        // The loaded queue stays and the version is not consumed, so the next
        // poll asks for the same change again.
      }
    };

    const poll = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return inFlightRef.current ?? Promise.resolve();
      }
      // One refresh at a time: the interval and a visibilitychange both fire
      // the moment a backgrounded tab comes back.
      if (inFlightRef.current) return inFlightRef.current;
      const pending = run().finally(() => {
        if (inFlightRef.current === pending) inFlightRef.current = null;
      });
      inFlightRef.current = pending;
      return pending;
    };

    const interval = setInterval(() => void poll(), POLL_MS_PUBLIC);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      generationRef.current += 1;
      inFlightRef.current = null;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, queryClient]);

  // A different queue: its own head version, its own page one.
  useEffect(() => {
    generationRef.current += 1;
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
    excluded: false,
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
    // `excluded` is the only view v1 offers, roster only: the public feed
    // never serves the rows it selects. The other views of the contract stay
    // unused until the desk has a place for them.
    if (filters.excluded) params.view = "excluded";
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
  if (isRoster && filters.excluded) n++;
  if (filters.window !== "all") n++;
  if (filters.minWords != null || filters.maxWords != null) n++;
  if (filters.hasImages) n++;
  if (filters.repMin > 0 || filters.repMax < 100) n++;
  if (filters.hideCurated !== defaults.hideCurated) n++;
  if (isRoster && filters.unreviewedOnly !== defaults.unreviewedOnly) n++;
  return n;
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  hashKey,
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
  type CurationDismissAction,
  type CurationFeedPage,
  type CurationFeedParams,
  type CurationHandoffEntry,
  type CurationMarkState,
  type CurationMyMarksResponse,
  type CurationRosterFeedPage,
  type CurationRosterFeedParams,
  type CurationRosterSetInput,
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
  MY_MARKS_PAGE_SIZE,
  POLL_MS_CURATOR,
  POLL_MS_CURATOR_EMPTY_QUEUE,
  POLL_MS_PUBLIC,
  QUEUE_PAGE_SIZE,
  SEED_STORAGE_KEY,
  LEGACY_SORT_STORAGE_KEY,
  SORT_STORAGE_KEY,
} from "./consts";
import { curationDeskApi } from "./curation-desk-api";
import { mergeHeadPage } from "./curation-head-merge";
import { rowHiddenByFeed, type FeedFilters } from "./curation-feed-rules";
import {
  findRowPosition,
  insertRowInPages,
  mergeTickIntoPages,
  removeRowFromPages,
  replaceRowInPages,
  type RowPosition,
} from "./curation-tick-merge";
import {
  pickSavedFilters,
  readSavedFilters,
  readStoredUsername,
  saveFilters,
} from "./curation-filter-storage";
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
    // The route's own boundary, always: it says whether more remain and where
    // the next page starts. The loaded page is no guide to either, because it
    // changes under the curator: rows leave it live (curated, reviewed by a
    // colleague), so a short page is no sign the queue ended, and rows come
    // back into it (an undo, a row a stale head read omitted), so its last
    // row's cursor could sit past posts the route has not served yet.
    getNextPageParam: (lastPage: CurationRosterFeedPage): string | undefined => lastPage?.next_cursor ?? undefined,
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

/**
 * When this desk last wrote a mark on a row. A tick or a head refresh that
 * left before that write can carry the row as it was before it, so their
 * answer for that row is discarded: the write's own answer is the newer one.
 */
const rowMutationAt = new Map<number, number>();
export function noteRowMutation(postId: number) {
  rowMutationAt.set(postId, Date.now());
}
export function rowMutatedSince(postId: number, sentAt: number): boolean {
  // The same millisecond counts: a read that raced the write is the case.
  const at = rowMutationAt.get(postId);
  return at != null && at >= sentAt;
}
/** For specs only. */
export function resetRowMutations() {
  rowMutationAt.clear();
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
  /** The feed's own filters: a row the tick moves outside them leaves the list. */
  feed?: FeedFilters;
}

function withoutRowsMutatedSince(tick: CurationTickResponse, sentAt: number): CurationTickResponse {
  const fresh = <T extends { post_id: number }>(items: T[] | undefined) =>
    items?.filter((item) => !rowMutatedSince(item.post_id, sentAt));
  if (!rowMutationAt.size) return tick;
  return {
    ...tick,
    overlay: fresh(tick.overlay) ?? tick.overlay,
    deltas: {
      ...tick.deltas,
      marks: fresh(tick.deltas?.marks) ?? [],
      flags: fresh(tick.deltas?.flags) ?? [],
      signals: fresh(tick.deltas?.signals) ?? [],
      rows: fresh(tick.deltas?.rows),
    },
  };
}

export interface TickState {
  teamCursor: CurationTeamCursor | null;
  activeCurators: CurationActiveCurator[];
  /**
   * How far each curator has got. Null until a tick has answered under the
   * current key, and null from a backend that does not send it: those are
   * not "nobody has marked", which only an empty array means.
   */
  handoff: CurationHandoffEntry[] | null;
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
  const feedRef = useRef(options.feed);
  feedRef.current = options.feed;
  const sinceRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  /**
   * When the last tick that was answered left. The interval paces an empty
   * queue off it, so a failed tick does not count: the next interval retries.
   */
  const lastAnsweredAtRef = useRef<number | null>(null);
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
    handoff: null,
    trailAlerts: [],
    paused: false,
    lastTickAt: null,
  });

  const tickNow = useCallback(async () => {
    if (!enabled || !username || inFlightRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    // An empty queue is not a reason to stop: the tick also carries the team
    // hand-off and who is active, and a curator whose filters match nothing is
    // exactly the one reading the bar. The lists just go out empty.
    const rows = rowsRef.current;
    if (Date.now() - lastActivityAt > IDLE_MS) return;

    const visible = visibleRef.current().slice(0, 100);
    const need = rows.filter((r) => r.overlay == null).map((r) => r.post_id).slice(0, 100);
    const since = sinceRef.current ?? feedGeneratedAtRef.current ?? null;
    // Captured at the start of the request, never read back off the refs
    // around the await: the account or the filters may change while the tick
    // is in flight, so the answer describes the queue that asked for it.
    const generation = generationRef.current;
    const key = feedKeyRef.current;
    const feed = feedRef.current;
    const sentAt = Date.now();
    inFlightRef.current = true;
    try {
      const answer: CurationTickResponse = await curationDeskApi.tick(username, {
        since,
        need,
        visible,
      });
      if (generation !== generationRef.current) return;
      lastAnsweredAtRef.current = sentAt;
      // A row this desk marked while the tick was out is described here as it
      // was before the mark (an undo after a mark is the usual case), so the
      // mark's own answer stays and the tick's word on that row is dropped.
      const response = withoutRowsMutatedSince(answer, sentAt);
      sinceRef.current = response.generated_at ?? sinceRef.current;
      queryClient.setQueryData<InfiniteData<CurationRosterFeedPage, unknown>>(key, (old) =>
        mergeTickIntoPages(old, response, { feed })
      );
      if (response.truncated && since !== null) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      setState({
        teamCursor: response.team_cursor ?? null,
        activeCurators: response.active_curators ?? [],
        handoff: response.handoff ?? null,
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
    // An empty queue keeps ticking, but slower: the first tick goes out on
    // the usual cadence so the bar fills in, and from then on a queue with no
    // row to refresh asks again only once a minute. A visibility change, a
    // queue that fills up or a tick that failed returns to the 15 s cadence
    // on its own.
    const interval = setInterval(() => {
      const answeredAt = lastAnsweredAtRef.current;
      if (
        rowsRef.current.length === 0 &&
        answeredAt !== null &&
        Date.now() - answeredAt < POLL_MS_CURATOR_EMPTY_QUEUE
      ) {
        return;
      }
      void tickNow();
    }, POLL_MS_CURATOR);
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
    // A fresh queue gets its first tick on the usual cadence, even if the one
    // that just ended was empty and had slowed the interval down.
    lastAnsweredAtRef.current = null;
    // The state describes the queue that just ended, and the key changes with
    // the account too: a curator's hand-off, counts included, must not stay on
    // screen for the trial who signs in after them and has an empty queue.
    setState({ teamCursor: null, activeCurators: [], handoff: null, trailAlerts: [], paused: false, lastTickAt: null });
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
   * roster feed carries no version; there the loaded rows are the baseline
   * instead, so the same head move is caught without one.
   */
  feedVersion?: string | null;
  /** Decides whether a refreshed head can be merged into the loaded pages. */
  sort: CurationSort;
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

/** Newest `post_id` on the loaded page one, or null when nothing is loaded. */
function loadedHeadPostId(
  data: InfiniteData<CurationFeedPage | CurationRosterFeedPage, unknown> | undefined
): number | null {
  const items = data?.pages?.[0]?.items;
  if (!items?.length) return null;
  let head: number | null = null;
  for (const item of items) {
    const id = item?.post_id;
    if (typeof id === "number" && (head === null || id > head)) head = id;
  }
  return head;
}

/**
 * The feed independent signal, for a page that carries no version: a status
 * head above the newest loaded row is a post the queue does not have yet.
 */
function headAheadOfLoaded(next: FeedHeadVersion, loadedHead: number | null): boolean {
  if (next.latestPostId == null) return false;
  // An empty page one has no head to compare against, so the first status
  // with a head is an initial refresh: without it an initially empty desk
  // would record that status as its baseline and stay empty until the global
  // head moved again. The baseline is recorded once the refreshed page lands.
  if (loadedHead == null) return true;
  return next.latestPostId > loadedHead;
}

/**
 * `status` every 60 s while visible. Feed page 1 is fetched into a separate
 * `latest` key ONLY when the head moved, then swapped in with setQueryData
 * (structural sharing keeps untouched rows). The move is read from
 * `feed_version` plus `latest_post_id` against a baseline; where no baseline
 * exists yet, from `latest_post_id` against the loaded rows.
 *
 * The version is committed only once a page was installed, so a failed refresh
 * leaves the change for the next poll instead of consuming it. Key, fetcher and
 * a generation are captured when the request starts: an answer that arrives
 * after the filters or the account changed belongs to the queue that left.
 * Overlapping interval and visibilitychange polls share one in-flight promise.
 */
export function useStatusPoll({ enabled, feedKey, fetchPageOne, feedVersion, sort }: StatusPollOptions) {
  const queryClient = useQueryClient();
  const versionRef = useRef<FeedHeadVersion | null>(null);
  const feedKeyRef = useRef(feedKey);
  feedKeyRef.current = feedKey;
  const fetchRef = useRef(fetchPageOne);
  fetchRef.current = fetchPageOne;
  const feedVersionRef = useRef(feedVersion);
  feedVersionRef.current = feedVersion;
  const sortRef = useRef(sort);
  sortRef.current = sort;
  const generationRef = useRef(0);
  const inFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const run = async () => {
      const generation = generationRef.current;
      const key = feedKeyRef.current;
      const fetchPage = fetchRef.current;
      // Captured with the key, not read after the await: the sort decides both the
      // merge order and whether a merge happens at all, so a change while the page
      // was in flight would apply the new queue's rule to the old queue's cache.
      const sort = sortRef.current;
      let status: CurationStatus;
      try {
        status = await queryClient.fetchQuery({ ...getCurationStatusQueryOptions(), staleTime: 0 });
      } catch {
        return;
      }
      if (generation !== generationRef.current) return;
      const next = statusHeadVersion(status);
      const feedState =
        queryClient.getQueryState<InfiniteData<CurationFeedPage | CurationRosterFeedPage, unknown>>(key);
      const baseline =
        versionRef.current ??
        (typeof feedVersionRef.current === "string"
          ? { feedVersion: feedVersionRef.current, latestPostId: null }
          : null);
      // A roster page carries no feed_version, so with no baseline the first
      // answer would only be recorded and a post that arrived while page one
      // was loading would wait for the head to move again. The head id needs
      // no version: above the newest loaded row it is a post the queue does
      // not have. The baseline is then recorded with the page that lands.
      const moved = baseline
        ? headVersionMoved(baseline, next)
        : headAheadOfLoaded(next, loadedHeadPostId(feedState?.data));
      // Nothing to refresh: recording what status says costs nothing and fills
      // the half a loaded page could not seed.
      if (!moved) {
        versionRef.current = next;
        return;
      }
      // Page one is missing, or it is in flight and was asked for under the
      // older head. Recording the version here would consume a change the
      // page that lands next may not carry, so the poll leaves it: the next
      // one reads the same change against a queue that is actually there.
      if (!feedState || feedState.data === undefined || feedState.fetchStatus === "fetching") {
        return;
      }
      try {
        const sentAt = Date.now();
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
          // Keep every loaded page: replacing them is what threw the
          // curator's place away every time the head moved.
          (old) => mergeHeadPage(old, page, sort, { wroteSince: (row) => rowMutatedSince(row.post_id, sentAt) })
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

/**
 * A marked (or cleared) row, applied to every loaded roster feed. Each feed
 * judges the row by its own filters, read off its key: the unreviewed-only
 * queue drops a row just marked reviewed, the queue showing every mark keeps
 * it with its badge. `restoreAt` puts a row an undo brought back where it was.
 */
function applyMarkedRow(
  queryClient: ReturnType<typeof useQueryClient>,
  username: string | undefined,
  row: DeskRow,
  restoreAt?: RestorePosition
) {
  noteRowMutation(row.post_id);
  for (const query of queryClient.getQueryCache().findAll({ queryKey: rosterFeedPrefix(username) })) {
    const feed = (query.queryKey[3] ?? {}) as FeedFilters;
    if (rowHiddenByFeed(row, feed)) {
      queryClient.setQueryData<InfiniteData<CurationRosterFeedPage, unknown>>(query.queryKey, (old) =>
        removeRowFromPages(old, row.post_id)
      );
      continue;
    }
    if (restoreAt && hashKey(restoreAt.key) === query.queryHash) {
      queryClient.setQueryData<InfiniteData<CurationRosterFeedPage, unknown>>(query.queryKey, (old) =>
        insertRowInPages(old, row, restoreAt)
      );
      continue;
    }
    const data = query.state.data as InfiniteData<CurationRosterFeedPage, unknown> | undefined;
    if (findRowPosition(data, row.post_id)) {
      queryClient.setQueryData<InfiniteData<CurationRosterFeedPage, unknown>>(query.queryKey, (old) =>
        replaceRowInPages(old, row)
      );
    } else if (restoreAt && query.getObserversCount() === 0) {
      // Another cached feed let the row go on the mark and has no place to
      // put it back; nobody is reading it, so it is fetched afresh when next
      // shown rather than shown without the row.
      queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
    }
  }
}

/** Where a row sat in one feed before a mark took it out; `key` names the feed. */
export interface RestorePosition extends RowPosition {
  key: QueryKey;
}

/** The place a row holds in the feed under `key` right now, for an undo to restore. */
export function useRowPosition(key: QueryKey, sort: CurationSort) {
  const queryClient = useQueryClient();
  return useCallback(
    (postId: number): RestorePosition | undefined => {
      const at = findRowPosition(queryClient.getQueryData<InfiniteData<CurationRosterFeedPage, unknown>>(key), postId);
      return at ? { key, sort, ...at } : undefined;
    },
    [queryClient, key, sort]
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
        lane: input.lane,
      });
    },
    onSuccess: (response) => {
      if (response?.row) applyMarkedRow(queryClient, username, response.row);
      queryClient.invalidateQueries({ queryKey: [...QueryKeys.curation._prefix, MY_MARKS_KEY_SUFFIX, username] });
    },
  });
}

export interface ClearMarkInput extends Pick<DeskRow, "author" | "permlink"> {
  /** Captured before the mark that took the row out, so the undo puts it back there. */
  restoreAt?: RestorePosition;
}

export function useClearMark() {
  const username = useActiveUsername();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [...QueryKeys.curation._prefix, "mark-clear", username],
    mutationFn: async (row: ClearMarkInput) => {
      noteCuratorActivity();
      return curationDeskApi.markClear(username, { author: row.author, permlink: row.permlink });
    },
    onSuccess: (response, variables) => {
      if (response?.row) applyMarkedRow(queryClient, username, response.row, variables.restoreAt);
      queryClient.invalidateQueries({ queryKey: [...QueryKeys.curation._prefix, MY_MARKS_KEY_SUFFIX, username] });
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
      if (response?.row) applyMarkedRow(queryClient, username, response.row);
      queryClient.invalidateQueries({ queryKey: QueryKeys.curation._recommendationsPrefix });
      queryClient.invalidateQueries({ queryKey: QueryKeys.curation.post(variables.author, variables.permlink) });
    },
  });
}

/**
 * My marks (web-owned infinite query; every page awaits ensureValidToken).
 * Keyset pagination on the route's own `next_cursor`, which is null on the
 * last page, so the list reaches past the first page instead of stopping at
 * the page size. The state filter stays on the key: each tab is its own list.
 */
export function useMyMarks(state: CurationMarkState | undefined, enabled = true) {
  const username = useActiveUsername();
  return useInfiniteQuery({
    queryKey: myMarksKey(username, state),
    enabled: enabled && !!username,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }: { pageParam?: string; signal?: AbortSignal }) =>
      curationDeskApi.myMarks(username, { state, limit: MY_MARKS_PAGE_SIZE, cursor: pageParam }, signal),
    getNextPageParam: (lastPage: CurationMyMarksResponse): string | undefined =>
      lastPage?.next_cursor ?? undefined,
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
    // Full curation weight, where a vote earns the most. Older posts are one
    // window change away.
    window: "full",
    minWords: null,
    maxWords: null,
    hasImages: false,
    repMin: 0,
    repMax: 100,
    excluded: false,
  };
}

/**
 * Every viewer opens on oldest unreviewed, so the whole team works the queue
 * in the same order. Role defaults resolve synchronously from `isRoster`, so
 * the first roster feed request already carries hide_reviewed once the roster
 * lookup has answered, with no second fetch to correct it.
 */
export function resolveFilters(filters: QueueFilters, isRoster: boolean): ResolvedQueueFilters {
  const sort: CurationSort = filters.sort ?? "queue";
  return {
    ...filters,
    sort: !isRoster && sort === "random" ? "queue" : sort,
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
  const username = useActiveUsername();
  // WHOSE filters are applied, not merely that some restore has happened. A
  // boolean would stay true through an account change, and both feeds would
  // fetch page one for the new account under the old account's refine set
  // before the effect below had a chance to correct it.
  const [restoredFor, setRestoredFor] = useState<string | null | undefined>(undefined);
  const ownerRef = useRef<string | null | undefined>(undefined);
  const dirtyRef = useRef(false);

  // Browser-only state after mount: the saved refine set and the persisted
  // sort (both per viewer, try/catch) and the session seed, generated once per
  // browser session. Keyed on the account so switching users re-reads.
  useEffect(() => {
    const owner = username ?? readStoredUsername();
    if (ownerRef.current === owner) return;
    const previous = ownerRef.current;
    ownerRef.current = owner;
    // A change made under the previous account must never be written into this
    // account's entry.
    dirtyRef.current = false;

    let persisted: CurationSort | null = null;
    try {
      // An order stored before everyone moved to oldest unreviewed is not restored.
      ls.remove(LEGACY_SORT_STORAGE_KEY);
      const stored = ls.get(SORT_STORAGE_KEY);
      if (typeof stored === "string" && SORTS.includes(stored as CurationSort)) persisted = stored as CurationSort;
    } catch {
      persisted = null;
    }
    const seed = readSessionSeed();
    const saved = readSavedFilters(owner);
    // Signing in from an anonymous visit keeps what is on screen, because the
    // curator picked it a moment ago and would not expect it to vanish.
    // Switching between two accounts never does: that would apply, and on the
    // next edit save, one curator's lane under another's name.
    const carry = previous === null && Object.keys(saved).length === 0;
    // One setFilters call, so sort and seed can never be applied apart: a
    // restored `random` without its seed is a request the backend refuses.
    setFilters((prev) =>
      carry
        ? { ...prev, sort: prev.sort ?? persisted, seed }
        : { ...defaultQueueFilters(), ...saved, sort: prev.sort ?? persisted, seed }
    );
    setRestoredFor(owner);
  }, [username]);

  /**
   * Derived, never stored. On an account change `username` moves in one commit
   * and the effect follows in the next, so a stored flag would leave a window
   * where the feeds are enabled under the wrong account's params. `username`
   * is undefined until the store publishes it, and the cold-load owner is read
   * from the same key the store reads, so that case must not gate.
   */
  const restored =
    restoredFor !== undefined && (username === undefined || restoredFor === username);

  // Only a change the curator made is written back: the restore never saves
  // itself, and the write lands once per committed render rather than inside
  // the setFilters updater, which the two reputation sliders need.
  useEffect(() => {
    if (!restored || !dirtyRef.current) return;
    saveFilters(restoredFor ?? null, pickSavedFilters(filters, defaultQueueFilters(), isRoster));
  }, [filters, restored, restoredFor, isRoster]);

  const update = useCallback((patch: Partial<QueueFilters>) => {
    dirtyRef.current = true;
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
    // Clearing must clear the stored copy too, or the next visit restores
    // exactly what was just cleared and Reset reads as broken.
    dirtyRef.current = true;
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
  // The owner the record was read under, not the store's activeUser: the two
  // resolve from different places on a cold load, so labelling the line with
  // the store could name a different account than the one that was restored.
  const savedOwner = useMemo(
    () =>
      restored &&
      restoredFor != null &&
      Object.keys(pickSavedFilters(filters, defaultQueueFilters(), isRoster)).length > 0
        ? restoredFor
        : null,
    [restored, restoredFor, filters, isRoster]
  );

  return { filters: resolved, params, update, reset, reshuffle, activeCount, restored, restoredFor, savedOwner };
}

/**
 * Single source of truth for "how many filters are on". `scope: "refine"`
 * counts the refine panel only, leaving out the window and the two chips that
 * sit in the toolbar, so the panel badge and the toolbar's Reset count can
 * never disagree about what one filter is (a min/max word range is always one).
 */
export function countActiveFilters(
  input: QueueFilters,
  isRoster: boolean,
  scope: "all" | "refine" = "all"
): number {
  const filters = resolveFilters(input, isRoster);
  const defaults = resolveFilters(defaultQueueFilters(), isRoster);
  let n = 0;
  if (filters.app !== defaults.app) n++;
  if (filters.community) n++;
  if (filters.newAuthors) n++;
  if (filters.recommended) n++;
  if (isRoster && filters.flagged) n++;
  if (isRoster && filters.excluded) n++;
  if (filters.minWords != null || filters.maxWords != null) n++;
  if (filters.hasImages) n++;
  if (filters.repMin > 0 || filters.repMax < 100) n++;
  if (scope === "all") {
    if (filters.window !== defaults.window) n++;
    if (filters.hideCurated !== defaults.hideCurated) n++;
    if (isRoster && filters.unreviewedOnly !== defaults.unreviewedOnly) n++;
  }
  return n;
}

/**
 * True while the PRIMARY pointer is a finger: a phone or a tablet, not a
 * machine with a mouse. The desk opens the quick view on a double click, which
 * a touch screen never sends, so on a phone the drawer was reachable only
 * through the vote button and curators opened the post in a new tab instead,
 * losing the reviewed and next controls that live in the drawer.
 *
 * Deliberately the primary-pointer query and not `any-pointer: coarse`. This
 * answers a question about the DEVICE — can its owner hover a tooltip, and what
 * should a click carrying no pointer information be read as — and a touchscreen
 * laptop driven by a mouse must answer no to both. Which branch a real click
 * takes is decided per interaction from the pointerdown that preceded it, in
 * CurationQueueRow. Starts false so the server render and the first client
 * render agree, then settles in an effect and follows a device that gains a
 * mouse.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(pointer: coarse)");
    setCoarse(query.matches);
    const onChange = (event: MediaQueryListEvent) => setCoarse(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return coarse;
}

// ---------------------------------------------------------------------------
// Roster admin
// ---------------------------------------------------------------------------

/**
 * The admin view of the roster. Separate from useViewerRole's public roster
 * query on purpose: this one carries notes, added_by and the retired rows, it
 * is per viewer, and it must never share a cache entry with the public one.
 */
export function useCurationRosterAdmin(enabled = true) {
  const username = useActiveUsername();
  return useQuery({
    queryKey: QueryKeys.curation.rosterAdmin(username),
    queryFn: ({ signal }) => curationDeskApi.rosterList(username, signal),
    enabled: enabled && !!username,
    staleTime: 60_000,
  });
}

/**
 * Both roster caches after a write: the admin list and the public one every desk reads.
 * The admin list goes by PREFIX, not by this viewer's key. The roster is shared state, so
 * a write here makes another signed-in admin's cached copy wrong too, and switching
 * account would show it for as long as its staleTime lasts.
 */
function invalidateRoster(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: QueryKeys.curation.rosterAdminPrefix() });
  queryClient.invalidateQueries({ queryKey: QueryKeys.curation.roster() });
}

export function useCurationRosterSet() {
  const username = useActiveUsername();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [...QueryKeys.curation._prefix, "roster-set", username],
    mutationFn: (input: CurationRosterSetInput) => curationDeskApi.rosterSet(username, input),
    onSuccess: () => invalidateRoster(queryClient),
  });
}

export function useCurationRosterRetire() {
  const username = useActiveUsername();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [...QueryKeys.curation._prefix, "roster-retire", username],
    mutationFn: (curator: string) => curationDeskApi.rosterRetire(username, curator),
    onSuccess: () => invalidateRoster(queryClient),
  });
}

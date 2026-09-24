"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import i18next from "i18next";
import type { VirtuosoHandle } from "react-virtuoso";
import {
  getCurationFeedInfiniteQueryOptions,
  type CurationFlagReason,
  type CurationHandoffEntry,
} from "@ecency/sdk";
import { EcencyConfigManager } from "@/config";
import { error as errorToast, info as infoToast } from "@/features/shared/feedback";
import { formatError } from "@/api/format-error";
import * as ls from "@/utils/local-storage";
import { OWN_MARK_WINDOW_MS, UNDO_REVIEWED_MS } from "./consts";
import { FlagDialog, NoteDialog, ShortcutSheet, SnoozeDialog } from "./curation-action-dialogs";
import { curationDeskApi } from "./curation-desk-api";
import { CurationHandoffBar } from "./curation-handoff-bar";
import { CurationHeader } from "./curation-header";
import { useCurationKeyboard } from "./curation-keyboard";
import { buildQueueDisplay, navigableRows, rowKey } from "./curation-queue-display";
import { CurationQuickView } from "./curation-quick-view";
import type { CurationRecommendHandle } from "./curation-recommend-btn";
import { CurationSortFilterBar } from "./curation-sort-filter-bar";
import { useCurationTicker } from "./curation-ticker";
import { inWindow } from "./curation-window";
import { CurationToolbar } from "./curation-toolbar";
import {
  filtersToParams,
  publicPageOneFetcher,
  rosterFeedQueryOptions,
  useClearMark,
  useCoarsePointer,
  useCurationFeed,
  useCurationMark,
  useCurationRosterFeed,
  useCurationStatus,
  useCurationTick,
  useQueueFilters,
  useRowPosition,
  useStatusPoll,
  useViewerRole,
} from "./hooks";
import type { DeskRow } from "./types";
import { openInNewTab } from "@/utils/open-in-new-tab";

// Client-only: the virtual list measures the window.
const CurationQueueList = dynamic(() => import("./curation-queue-list").then((m) => m.CurationQueueList), {
  ssr: false,
  loading: () => <CurationQueueSkeleton />,
});

export function CurationQueueSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label={i18next.t("curation-desk.list.loading")}>
      {Array.from({ length: rows }).map((_, i) => (
        // Same geometry as CurationQueueRow at every breakpoint: a fixed 72 px
        // row would shift the page when the real list replaces it, since the
        // row wraps its time block and its actions onto their own lines below lg.
        <div
          key={i}
          className="flex flex-wrap gap-x-3 gap-y-2 border-b border-[--border-color] px-4 py-4 sm:px-5"
        >
          <div className="flex w-full shrink-0 items-center gap-2 sm:w-36 sm:flex-col sm:items-start">
            <div className="h-4 w-12 rounded animate-pulse bg-gray-200 dark:bg-dark-default" />
            <div className="h-4 w-20 rounded-full animate-pulse bg-gray-200 dark:bg-dark-default" />
          </div>
          <div className="hidden size-16 shrink-0 rounded-lg animate-pulse bg-gray-200 dark:bg-dark-default sm:block" />
          <div className="min-w-0 flex-1 flex flex-col gap-2">
            <div className="h-4 w-3/4 rounded animate-pulse bg-gray-200 dark:bg-dark-default" />
            <div className="h-3 w-1/2 rounded animate-pulse bg-gray-200 dark:bg-dark-default" />
          </div>
          <div className="flex w-full flex-wrap items-center justify-end gap-1 lg:w-auto">
            <div className="h-7 w-16 rounded-lg animate-pulse bg-gray-200 dark:bg-dark-default" />
            <div className="h-7 w-16 rounded-lg animate-pulse bg-gray-200 dark:bg-dark-default" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Unsent reply text for one post, read from the key the editor itself writes
 * on every keystroke (`Comment` holds its body in local storage under
 * `reply_text_<author>_<permlink>`, and empties it on a successful submit).
 *
 * ⛔ NOT read from the DOM. By the time the departure effect runs, React has
 * already re-rendered without the row and unmounted the drawer, so the editor
 * and its textarea are gone: a DOM read answers false exactly when it matters.
 * The stored draft outlives the unmount, which is the whole point.
 */
function unsentReplyFor(row: DeskRow): boolean {
  const text = ls.get(`reply_text_${row.author}_${row.permlink}`, "");
  return typeof text === "string" && text.trim().length > 0;
}

type Dialog =
  | { kind: "none" }
  | { kind: "snooze"; row: DeskRow }
  | { kind: "flag"; row: DeskRow }
  | { kind: "note"; row: DeskRow }
  | { kind: "help" };

interface Undo {
  message: string;
  /** Awaited by the bar, which reports a rejection and keeps itself up until then. */
  action: (() => Promise<unknown>) | null;
  until: number;
}

/**
 * The queue: header widgets, toolbar and filter chips, the virtualized list,
 * the quick view drawer and one document keyboard listener. Roster members
 * read the authed roster feed (marks inline, hide_reviewed and hide_snoozed as
 * server params on the key); everyone else reads the public feed builder.
 */
export function CurationQueueView() {
  const viewer = useViewerRole();
  const recommendationsEnabled = EcencyConfigManager.useConfig(
    ({ visionFeatures }) => visionFeatures.curationDesk.recommendations.enabled
  );
  const { filters, params, update, reset, reshuffle, activeCount, narrowed, restored, savedOwner } =
    useQueueFilters(viewer.isRoster);
  const coarsePointer = useCoarsePointer();
  const publicParams = useMemo(() => filtersToParams(filters, false), [filters]);

  // Both feeds wait for the saved refine set, so the desk issues exactly one
  // page-one request instead of one on the defaults and a second to correct it.
  const rosterFeed = useCurationRosterFeed(viewer.username, params, viewer.isRoster && restored);
  const publicFeed = useCurationFeed(publicParams, restored && !viewer.isRoster && !viewer.isLoading);
  const feed = viewer.isRoster ? rosterFeed : publicFeed;
  const status = useCurationStatus();

  // The page objects ARE the rows: normalising each one into a new object here
  // would hand every memoized row a new identity on every tick, which is what
  // the identity preserving merge exists to avoid. A public row simply has no
  // overlay; every consumer reads it with `?.`.
  const rows = useMemo<DeskRow[]>(() => {
    const pages = feed.data?.pages ?? [];
    const out: DeskRow[] = [];
    for (const page of pages) for (const item of page.items) out.push(item);
    return out;
  }, [feed.data]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.post_id, r])), [rows]);

  const visibleRef = useRef<DeskRow[]>([]);
  const onVisibleRows = useCallback((visible: DeskRow[]) => {
    visibleRef.current = visible;
  }, []);
  const getVisibleIds = useCallback(() => visibleRef.current.map((r) => r.post_id), []);

  const queryKey = useMemo(
    () =>
      viewer.isRoster
        ? rosterFeedQueryOptions(viewer.username, params).queryKey
        : getCurationFeedInfiniteQueryOptions(publicParams).queryKey,
    [viewer.isRoster, viewer.username, params, publicParams]
  );

  const firstPage = feed.data?.pages?.[0];

  const tick = useCurationTick({
    username: viewer.username,
    // Not gated on rows: with an empty filtered queue the hand-off bar is the
    // only thing on screen, and it needs the tick to update and to age.
    enabled: viewer.isRoster,
    feedKey: queryKey,
    rows,
    getVisibleIds,
    feedGeneratedAt: firstPage?.generated_at,
    feed: params,
  });

  const fetchPageOne = useMemo(
    () =>
      viewer.isRoster
        ? (signal?: AbortSignal) => curationDeskApi.rosterFeed(viewer.username, params, undefined, signal)
        : publicPageOneFetcher(publicParams),
    [viewer.isRoster, viewer.username, params, publicParams]
  );
  // The public feed page carries the version its rows were selected under; the
  // roster page carries none, so there the poll compares the status head
  // against the loaded rows instead.
  const feedVersion = (firstPage as { feed_version?: string | null } | undefined)?.feed_version;
  // Kept for the roster too: the tick answers about loaded rows, so a post
  // that reached page 1 after the last fetch only appears through this poll.
  // Enabled whatever the row count is: an empty filtered view is exactly the
  // one that needs to hear about the first post that matches it.
  useStatusPoll({ enabled: true, feedKey: queryKey, fetchPageOne, feedVersion, sort: filters.sort });

  const teamCursor = tick.teamCursor ?? firstPage?.team_cursor ?? status.data?.team_cursor ?? null;
  // "Your queue starts at the oldest post nobody has handled" is true only when
  // every handled kind is out of the list: reviewed and snoozed (unreviewedOnly),
  // curated (hideCurated), and neither moderation lens, since the flagged lens
  // selects handled rows and the excluded view lists rows the queue never
  // serves. Oldest first, or "starts at" means nothing.
  const queueStartsAtOldestUnhandled =
    filters.sort === "queue" &&
    filters.unreviewedOnly &&
    filters.hideCurated &&
    !filters.flagged &&
    !filters.excluded;
  // The tick is the authority once it has answered under this key, an empty
  // answer included (that is how a position that aged out leaves the bar) and
  // an answer with no hand-off at all included: during a rolling deploy a page
  // from the new backend can be followed by a tick from the old one, and
  // falling back to the page then would revive its entries and label them
  // freshly updated. Only before the first answer does the loaded page seed
  // the bar, so it is filled on arrival rather than blank for fifteen seconds.
  // Null means "not known" and is never rendered as nobody marked.
  const handoff: CurationHandoffEntry[] | null =
    tick.lastTickAt != null
      ? tick.handoff
      : (firstPage as { handoff?: CurationHandoffEntry[] } | undefined)?.handoff ?? null;
  const totalEstimate = viewer.isRoster ? (firstPage as { total_estimate?: number | null } | undefined)?.total_estimate : undefined;
  const communities = (firstPage as { facets?: { communities: Array<{ community: string; title?: string | null; count?: number }> } } | undefined)?.facets?.communities ?? [];

  const now = useCurationTicker();
  const [expanded, setExpanded] = useState({ half: false, eighth: false, olderReviewed: false });
  const display = useMemo(
    () => buildQueueDisplay({ rows, teamCursor, sort: filters.sort, now, window: filters.window, expanded }),
    [rows, teamCursor, filters.sort, now, filters.window, expanded]
  );
  const ordered = useMemo(() => navigableRows(display.items), [display.items]);

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [quickView, setQuickView] = useState(false);
  // A post the drawer keeps showing after it left the feed, because the
  // curator was mid-reply on it. Read by the drawer's `row` and by nothing
  // else: the selection is cleared while a row is held, so no desk key can
  // act on the row that slid into its place. `resumeKey` is where the
  // selection goes when the hold is released.
  const [held, setHeld] = useState<{ row: DeskRow; resumeKey: string | null } | null>(null);
  // Which row the drawer's reply box is open for. Lives here, not in the
  // drawer, because the drawer is unmounted before the departure effect asks:
  // anything it owns is gone by then. Deliberately never cleared on its
  // unmount, and row-keyed on both sides so a stale value cannot answer for
  // another post.
  const replyOpenForRef = useRef<string | null>(null);
  const [voteOnOpen, setVoteOnOpen] = useState(false);
  const [recommendOnOpen, setRecommendOnOpen] = useState(false);
  // The row that asked, not a flag: j/k stay alive while the entry loads,
  // so a flag alone would open the reply box or the tip on whatever post the
  // curator moved to meanwhile.
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [tipFor, setTipFor] = useState<string | null>(null);
  useEffect(() => {
    if (commentFor != null && commentFor !== activeKey) setCommentFor(null);
    if (tipFor != null && tipFor !== activeKey) setTipFor(null);
  }, [activeKey, commentFor, tipFor]);
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [undo, setUndo] = useState<Undo | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const listRef = useRef<VirtuosoHandle | null>(null);
  const recommendRef = useRef<CurationRecommendHandle | null>(null);

  const activeIndex = activeKey ? ordered.findIndex((r) => rowKey(r) === activeKey) : -1;
  const activeRow = activeIndex >= 0 ? ordered[activeIndex] : null;
  const heldRef = useRef(held);
  heldRef.current = held;
  const releaseHeld = useCallback(() => {
    const current = heldRef.current;
    if (!current) return;
    setHeld(null);
    if (current.resumeKey) setActiveKey(current.resumeKey);
  }, []);

  // Marks this desk made, so a row leaving on its own mark reads as the
  // curator moving on, while a row a colleague took leaves under their hands.
  const ownMarksRef = useRef(new Map<string, number>());
  const noteOwnMark = useCallback((row: DeskRow) => ownMarksRef.current.set(rowKey(row), Date.now()), []);
  const prevOrderedRef = useRef<DeskRow[]>([]);
  const prevKeyRef = useRef(queryKey);
  // The selected row can stop resolving for three reasons, and only one of
  // them is a live departure: the row left the loaded pages under the curator
  // (a colleague reviewed it, it got curated, or this desk marked it). Then
  // the selection moves to the row that took its place, never back to the
  // top, so j keeps walking down. A drawer open on a post a colleague took
  // closes with a word: it must never swap to a post the curator has not
  // read. A different feed (lens, sort, account) is a different list with
  // nothing chosen in it, and a row folded into a collapsed tail is still
  // loaded, so the selection simply waits for it.
  useEffect(() => {
    const prev = prevOrderedRef.current;
    prevOrderedRef.current = ordered;
    if (prevKeyRef.current !== queryKey) {
      prevKeyRef.current = queryKey;
      if (activeKey) setActiveKey(null);
      if (quickView) setQuickView(false);
      setHeld(null);
      return;
    }
    if (!activeKey || activeIndex >= 0) return;
    const prevIndex = prev.findIndex((r) => rowKey(r) === activeKey);
    if (prevIndex < 0) return;
    if (rows.some((r) => rowKey(r) === activeKey)) return;
    const ownAt = ownMarksRef.current.get(activeKey);
    ownMarksRef.current.delete(activeKey);
    const own = ownAt != null && Date.now() - ownAt < OWN_MARK_WINDOW_MS;
    const successor = ordered.length ? rowKey(ordered[Math.min(prevIndex, ordered.length - 1)]) : null;
    const departed = prev[prevIndex];
    if (!own && quickView) {
      // Mid-reply, so the drawer stays on this post instead of unmounting the
      // editor under the curator. The usual way here is their own vote with
      // Hide Curated on: they curate, start a comment, and the post leaves the
      // queue a few seconds later. Nothing is selected while it is held, so a
      // stray keystroke cannot mark the row that took its place.
      //
      // The same hold covers a post that aged out of the chosen window while it
      // was being read. Under 24 h, oldest first, the rows at the top are the
      // ones about to cross the edge, and the server stops serving them there.
      // Nobody took the post, so the colleague word would be wrong.
      const agedOut = !inWindow(filters.window, departed.created, departed.payout_at, Date.now());
      if (agedOut || (replyOpenForRef.current === activeKey && unsentReplyFor(departed))) {
        setHeld({ row: departed, resumeKey: successor });
        setActiveKey(null);
        return;
      }
      setQuickView(false);
      infoToast(i18next.t("curation-desk.live.left-queue"));
    }
    setActiveKey(successor);
  }, [ordered, rows, queryKey, activeKey, activeIndex, quickView, filters.window]);

  // Every loaded row can leave live while the server still holds more: the
  // list is not mounted to ask for the next page from its end, so it is
  // asked for here, rather than showing "nothing to review" over a queue.
  // A page that failed is not asked for again from here: the error shows,
  // and the next status poll or a refresh asks anew.
  useEffect(() => {
    if (rows.length === 0 && feed.hasNextPage && !feed.isFetching && !feed.isError && !feed.isFetchNextPageError) {
      void feed.fetchNextPage();
    }
  }, [rows.length, feed.hasNextPage, feed.isFetching, feed.isError, feed.isFetchNextPageError, feed.fetchNextPage]);
  const neighbour = activeIndex >= 0 ? ordered[activeIndex + 1] ?? null : null;

  const mark = useCurationMark();
  const clearMark = useClearMark();

  // The bar outlives its window while an undo is in flight: dropping it there
  // would tell the viewer the undo applied before the request answered.
  useEffect(() => {
    if (!undo || undoBusy) return;
    const handle = setTimeout(() => setUndo(null), Math.max(0, undo.until - Date.now()));
    return () => clearTimeout(handle);
  }, [undo, undoBusy]);

  const runUndo = useCallback(async () => {
    const current = undo;
    if (!current?.action || undoBusy) return;
    setUndoBusy(true);
    try {
      await current.action();
      // A mark or cursor move made while this undo was in flight installed a
      // bar of its own; only the entry this run executed comes down.
      setUndo((latest) => (latest === current ? null : latest));
    } catch (e) {
      errorToast(...formatError(e));
    } finally {
      setUndoBusy(false);
    }
  }, [undo, undoBusy]);

  const scrollTo = useCallback(
    (index: number) => {
      const row = ordered[index];
      if (!row) return;
      setActiveKey(rowKey(row));
      const displayIndex = display.items.findIndex((i) => i.type === "row" && i.key === rowKey(row));
      if (displayIndex >= 0) listRef.current?.scrollIntoView({ index: displayIndex, align: "center", behavior: "auto" });
    },
    [ordered, display.items]
  );

  const move = useCallback(
    (delta: number) => {
      // Held on a departed post: the remembered successor is exactly where a
      // step down leads, so releasing IS the move.
      if (heldRef.current) {
        releaseHeld();
        return;
      }
      if (ordered.length === 0) return;
      const next = activeIndex < 0 ? (delta > 0 ? 0 : ordered.length - 1) : Math.min(ordered.length - 1, Math.max(0, activeIndex + delta));
      scrollTo(next);
    },
    [ordered.length, activeIndex, scrollTo, releaseHeld]
  );

  const requireRoster = useCallback(
    (fn: () => void) => () => {
      if (!viewer.isRoster) return;
      fn();
    },
    [viewer.isRoster]
  );

  const positionOf = useRowPosition(queryKey, filters.sort);
  const doMark = useCallback(
    async (row: DeskRow, input: { state: "reviewed" | "snoozed" | "flagged" | "noted"; reason?: string; note?: string; snooze_until?: string }, message: string) => {
      // A reviewed row leaves an unreviewed-only queue at once, so its place
      // is captured before the mark for the undo to put it back there.
      const restoreAt = positionOf(row.post_id);
      noteOwnMark(row);
      try {
        // The lane this desk is showing rides on the mark, so the hand-off can
        // say which queue the position was earned in without ever guessing.
        await mark.mutateAsync({ row, ...input, lane: params });
        // A held post already left the list, so no departure will move the
        // drawer on once it is snoozed or flagged: the hold is released here,
        // which resumes at the successor saved when it left.
        if (input.state !== "noted" && heldRef.current?.row.post_id === row.post_id) releaseHeld();
        setUndo({
          message,
          action: input.state === "reviewed" ? () => clearMark.mutateAsync({ author: row.author, permlink: row.permlink, restoreAt }) : null,
          until: Date.now() + UNDO_REVIEWED_MS,
        });
      } catch (e) {
        // Nothing was written, so a departure of this row later is not the
        // curator's doing.
        ownMarksRef.current.delete(rowKey(row));
        errorToast(...formatError(e));
      }
    },
    [mark, clearMark, params, positionOf, noteOwnMark, releaseHeld]
  );

  const onSelect = useCallback((row: DeskRow) => {
    setHeld(null);
    setActiveKey(rowKey(row));
  }, []);
  const onOpen = useCallback((row: DeskRow) => {
    setHeld(null);
    setActiveKey(rowKey(row));
    setQuickView(true);
  }, []);
  const closeQuickView = useCallback(() => {
    releaseHeld();
    setQuickView(false);
    setVoteOnOpen(false);
    setRecommendOnOpen(false);
    setCommentFor(null);
    setTipFor(null);
  }, [releaseHeld]);
  const onVote = useCallback((row: DeskRow) => {
    setHeld(null);
    setActiveKey(rowKey(row));
    setQuickView(true);
    // The slider lives inside the drawer and only mounts once the entry query
    // resolves, so the drawer consumes this flag then. A fixed delay here
    // clicked nothing whenever the fetch took longer.
    setVoteOnOpen(true);
  }, []);
  const onReviewed = useCallback(
    (row: DeskRow) => {
      if (!viewer.isRoster) return;
      void doMark(row, { state: "reviewed" }, i18next.t("curation-desk.live.reviewed", { title: row.title }));
      // A held post already left the list, so it has no place in `ordered` to
      // step down from: the successor saved when it left is the next post, and
      // releasing the hold is the move.
      if (heldRef.current?.row.post_id === row.post_id) {
        releaseHeld();
        return;
      }
      const idx = ordered.findIndex((r) => r.post_id === row.post_id);
      if (idx >= 0 && idx + 1 < ordered.length) scrollTo(idx + 1);
    },
    [viewer.isRoster, doMark, ordered, scrollTo, releaseHeld]
  );
  const onSnooze = useCallback((row: DeskRow) => viewer.isRoster && setDialog({ kind: "snooze", row }), [viewer.isRoster]);
  const onFlag = useCallback((row: DeskRow) => viewer.isRoster && setDialog({ kind: "flag", row }), [viewer.isRoster]);
  const onNote = useCallback((row: DeskRow) => viewer.isRoster && setDialog({ kind: "note", row }), [viewer.isRoster]);
  const onSaveNote = useCallback(
    (row: DeskRow, note: string) => {
      if (!viewer.isRoster || !note) return;
      void doMark(row, { state: "noted", note }, i18next.t("curation-desk.live.noted"));
    },
    [viewer.isRoster, doMark]
  );
  const onClearMark = useCallback(
    async (row: DeskRow) => {
      if (!viewer.isRoster) return;
      try {
        await clearMark.mutateAsync(row);
        setUndo({ message: i18next.t("curation-desk.live.cleared"), action: null, until: Date.now() + UNDO_REVIEWED_MS });
      } catch (e) {
        errorToast(...formatError(e));
      }
    },
    [viewer.isRoster, clearMark]
  );

  useCurationKeyboard(
    {
      next: () => move(1),
      prev: () => move(-1),
      toggleQuickView: () => {
        if (!activeRow && ordered.length) scrollTo(0);
        setQuickView((v) => !v);
      },
      vote: () => activeRow && onVote(activeRow),
      // Both live in the drawer next to the vote slider and wait for the entry
      // there, the way the vote does.
      comment: () => {
        if (!activeRow) return;
        if (!quickView) setQuickView(true);
        setCommentFor(rowKey(activeRow));
      },
      tip: () => {
        if (!activeRow) return;
        if (!quickView) setQuickView(true);
        setTipFor(rowKey(activeRow));
      },
      reviewed: requireRoster(() => activeRow && onReviewed(activeRow)),
      skip: () => move(1),
      snooze: requireRoster(() => activeRow && onSnooze(activeRow)),
      flag: requireRoster(() => activeRow && onFlag(activeRow)),
      note: requireRoster(() => activeRow && onNote(activeRow)),
      recommend: () => {
        if (!activeRow) return;
        // The button lives in the drawer; the drawer consumes this flag once it
        // is mounted instead of a fixed delay that misses a slow render.
        if (!quickView) setQuickView(true);
        setRecommendOnOpen(true);
      },
      openExternal: () => {
        if (!activeRow) return;
        openInNewTab(`/@${activeRow.author}/${activeRow.permlink}`);
      },
      help: () => setDialog({ kind: "help" }),
    },
    rows.length > 0
  );

  const onToggleTail = useCallback((which: "half" | "eighth" | "olderReviewed") => {
    setExpanded((prev) => ({ ...prev, [which]: !prev[which] }));
  }, []);

  // The roster lookup decides WHICH feed is read, so "nothing here" cannot be
  // said while it, or the feed it selects, is still in flight.
  // A disabled query reports isLoading false, so the restore gate belongs in
  // both conditions: without it the shell would paint "nothing to review"
  // before the first request has even been allowed to go out.
  const empty = restored && !viewer.isLoading && !feed.isLoading && !feed.isFetching && rows.length === 0;

  return (
    <div className="reading-surface rounded-2xl overflow-hidden" data-curation-queue>
      <CurationHeader
        status={status.data}
        activeCurators={tick.activeCurators}
        isRoster={viewer.isRoster}
        livePaused={tick.paused}
        onHelp={() => setDialog({ kind: "help" })}
      />
      <CurationToolbar
        filters={filters}
        isRoster={viewer.isRoster}
        totalEstimate={totalEstimate}
        activeFilterCount={activeCount}
        narrowed={narrowed}
        onSort={(sort) => update({ sort })}
        onChange={update}
        onReshuffle={reshuffle}
        onReset={reset}
        savedOwner={savedOwner}
      />
      {viewer.isRoster && (
        <CurationHandoffBar
          entries={handoff}
          username={viewer.username}
          updatedAt={tick.lastTickAt}
          now={now}
          communities={communities}
          queueStartsAtOldestUnhandled={queueStartsAtOldestUnhandled}
        />
      )}
      <CurationSortFilterBar
        filters={filters}
        isRoster={viewer.isRoster}
        communities={communities}
        onChange={update}
      />

      <div className="sr-only" aria-live="polite" role="status">
        {undo?.message ?? ""}
      </div>
      {undo && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs bg-blue-duck-egg/40 dark:bg-blue-dark-grey/40 border-t border-[--border-color]">
          <span className="flex-1">{undo.message}</span>
          {undo.action && (
            <button
              type="button"
              className="underline"
              aria-label={i18next.t("curation-desk.live.undo")}
              disabled={undoBusy}
              onClick={() => void runUndo()}
            >
              {i18next.t("curation-desk.live.undo")}
            </button>
          )}
        </div>
      )}

      <div role="feed" aria-busy={feed.isFetching || !restored} aria-label={i18next.t("curation-desk.list.aria")} className="border-t border-[--border-color]">
        {/* Only over an empty surface: on a remount the cached rows are already
            here while `restored` flips in the mount effect, and a skeleton
            painted above them reads as the desk loading again. */}
        {(!restored || feed.isLoading) && rows.length === 0 && <CurationQueueSkeleton />}
        {feed.isError && (
          <p className="p-4 text-sm text-red-030 dark:text-red-light-020" role="alert">
            {i18next.t("curation-desk.list.error")}
          </p>
        )}
        {empty && !feed.isError && <p className="p-6 text-sm text-gray-500 text-center">{i18next.t("curation-desk.list.empty")}</p>}
        {rows.length > 0 && (
          <CurationQueueList
            ref={listRef}
            items={display.items}
            activeKey={activeKey}
            isRoster={viewer.isRoster}
            isTrial={viewer.isTrial}
            username={viewer.username}
            recommendationsEnabled={recommendationsEnabled}
            coarsePointer={coarsePointer}
            chronological={display.chronological}
            teamCursor={teamCursor}
            hasNextPage={feed.hasNextPage}
            isFetching={feed.isFetching}
            isFetchingNextPage={feed.isFetchingNextPage}
            dataUpdatedAt={feed.dataUpdatedAt}
            fetchNextPage={feed.fetchNextPage}
            onToggleTail={onToggleTail}
            onVisibleRows={onVisibleRows}
            onSelect={onSelect}
            onOpen={onOpen}
            onVote={onVote}
            onReviewed={onReviewed}
            onSnooze={onSnooze}
            onFlag={onFlag}
            onNote={onNote}
            onClearMark={onClearMark}
          />
        )}
      </div>

      <CurationQuickView
        row={quickView ? held?.row ?? (activeRow ? rowById.get(activeRow.post_id) ?? activeRow : null) : null}
        neighbour={neighbour}
        viewer={viewer}
        recommendationsEnabled={recommendationsEnabled}
        voteOnOpen={voteOnOpen}
        onVoteHandled={() => setVoteOnOpen(false)}
        recommendOnOpen={recommendOnOpen}
        onRecommendHandled={() => setRecommendOnOpen(false)}
        commentOnOpen={commentFor != null && commentFor === activeKey}
        onCommentHandled={() => setCommentFor(null)}
        tipOnOpen={tipFor != null && tipFor === activeKey}
        onTipHandled={() => setTipFor(null)}
        replyOpenFor={replyOpenForRef}
        onClose={closeQuickView}
        onPrev={() => move(-1)}
        onNext={() => move(1)}
        onReviewed={onReviewed}
        onSnooze={onSnooze}
        onFlag={onFlag}
        onNote={onNote}
        onSaveNote={onSaveNote}
        recommendRef={recommendRef}
      />

      {dialog.kind === "snooze" && (
        <SnoozeDialog
          title={dialog.row.title}
          onHide={() => setDialog({ kind: "none" })}
          onPick={(until, preset) => {
            setDialog({ kind: "none" });
            void doMark(dialog.row, { state: "snoozed", snooze_until: until }, i18next.t("curation-desk.live.snoozed", { preset: i18next.t(`curation-desk.snooze.preset-${preset}`) }));
          }}
        />
      )}
      {dialog.kind === "flag" && (
        <FlagDialog
          title={dialog.row.title}
          onHide={() => setDialog({ kind: "none" })}
          onPick={(reason: CurationFlagReason, note) => {
            setDialog({ kind: "none" });
            void doMark(dialog.row, { state: "flagged", reason, note: note || undefined }, i18next.t("curation-desk.live.flagged"));
          }}
        />
      )}
      {dialog.kind === "note" && (
        <NoteDialog
          title={dialog.row.title}
          onHide={() => setDialog({ kind: "none" })}
          onSave={(note) => {
            setDialog({ kind: "none" });
            onSaveNote(dialog.row, note);
          }}
        />
      )}
      {dialog.kind === "help" && <ShortcutSheet onHide={() => setDialog({ kind: "none" })} />}
      {!viewer.isRoster && viewer.kind === "member" && (
        <p className="px-3 py-2 text-[11px] text-gray-500 border-t border-[--border-color]">{i18next.t("curation-desk.list.member-hint")}</p>
      )}
    </div>
  );
}

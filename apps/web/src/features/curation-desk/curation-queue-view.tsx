"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import i18next from "i18next";
import type { VirtuosoHandle } from "react-virtuoso";
import { getCurationFeedInfiniteQueryOptions, type CurationFlagReason } from "@ecency/sdk";
import { EcencyConfigManager } from "@/config";
import { ModalConfirm } from "@ui/modal-confirm";
import { error as errorToast } from "@/features/shared/feedback";
import { formatError } from "@/api/format-error";
import { UNDO_CURSOR_MS, UNDO_REVIEWED_MS } from "./consts";
import { FlagDialog, NoteDialog, ShortcutSheet, SnoozeDialog } from "./curation-action-dialogs";
import { curationDeskApi } from "./curation-desk-api";
import { CurationHeader } from "./curation-header";
import { useCurationKeyboard } from "./curation-keyboard";
import { buildQueueDisplay, navigableRows, rowKey } from "./curation-queue-display";
import { CurationQuickView } from "./curation-quick-view";
import type { CurationRecommendHandle } from "./curation-recommend-btn";
import { CurationSortFilterBar } from "./curation-sort-filter-bar";
import { useCurationTicker } from "./curation-ticker";
import { CurationToolbar } from "./curation-toolbar";
import { formatUtcHm } from "./curation-window";
import {
  filtersToParams,
  publicPageOneFetcher,
  rosterFeedQueryOptions,
  useClearMark,
  useCurationFeed,
  useCurationMark,
  useCurationRosterFeed,
  useCurationStatus,
  useCurationTick,
  useQueueFilters,
  useSetCursor,
  useStatusPoll,
  useViewerRole,
} from "./hooks";
import type { DeskRow } from "./types";

// Client-only: the virtual list measures the window.
const CurationQueueList = dynamic(() => import("./curation-queue-list").then((m) => m.CurationQueueList), {
  ssr: false,
  loading: () => <CurationQueueSkeleton />,
});

export function CurationQueueSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label={i18next.t("curation-desk.list.loading")}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 px-3 py-2 h-[72px] border-b border-[--border-color]">
          <div className="w-[4.5rem] h-4 rounded animate-pulse bg-gray-200 dark:bg-dark-default" />
          <div className="size-16 rounded-lg animate-pulse bg-gray-200 dark:bg-dark-default" />
          <div className="flex-1 flex flex-col gap-2">
            <div className="h-4 w-3/4 rounded animate-pulse bg-gray-200 dark:bg-dark-default" />
            <div className="h-3 w-1/2 rounded animate-pulse bg-gray-200 dark:bg-dark-default" />
          </div>
        </div>
      ))}
    </div>
  );
}

type Dialog =
  | { kind: "none" }
  | { kind: "snooze"; row: DeskRow }
  | { kind: "flag"; row: DeskRow }
  | { kind: "note"; row: DeskRow }
  | { kind: "cursor"; row: DeskRow; count: number }
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
  const { filters, params, update, reset, reshuffle, activeCount } = useQueueFilters(viewer.isRoster);
  const publicParams = useMemo(() => filtersToParams(filters, false), [filters]);

  const rosterFeed = useCurationRosterFeed(viewer.username, params, viewer.isRoster);
  const publicFeed = useCurationFeed(publicParams, !viewer.isRoster && !viewer.isLoading);
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
    enabled: viewer.isRoster && rows.length > 0,
    feedKey: queryKey,
    rows,
    getVisibleIds,
    feedGeneratedAt: firstPage?.generated_at,
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
  useStatusPoll({ enabled: true, feedKey: queryKey, fetchPageOne, feedVersion });

  const teamCursor = tick.teamCursor ?? firstPage?.team_cursor ?? status.data?.team_cursor ?? null;
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
  const [voteOnOpen, setVoteOnOpen] = useState(false);
  const [recommendOnOpen, setRecommendOnOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [undo, setUndo] = useState<Undo | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const listRef = useRef<VirtuosoHandle | null>(null);
  const recommendRef = useRef<CurationRecommendHandle | null>(null);

  const activeIndex = activeKey ? ordered.findIndex((r) => rowKey(r) === activeKey) : -1;
  const activeRow = activeIndex >= 0 ? ordered[activeIndex] : null;
  const neighbour = activeIndex >= 0 ? ordered[activeIndex + 1] ?? null : null;

  const mark = useCurationMark();
  const clearMark = useClearMark();
  const setCursor = useSetCursor();

  // The bar outlives its window while an undo is in flight: dropping it there
  // would tell the viewer the undo applied before the request answered.
  useEffect(() => {
    if (!undo || undoBusy) return;
    const handle = setTimeout(() => setUndo(null), Math.max(0, undo.until - Date.now()));
    return () => clearTimeout(handle);
  }, [undo, undoBusy]);

  const runUndo = useCallback(async () => {
    const action = undo?.action;
    if (!action || undoBusy) return;
    setUndoBusy(true);
    try {
      await action();
      setUndo(null);
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
      if (ordered.length === 0) return;
      const next = activeIndex < 0 ? (delta > 0 ? 0 : ordered.length - 1) : Math.min(ordered.length - 1, Math.max(0, activeIndex + delta));
      scrollTo(next);
    },
    [ordered.length, activeIndex, scrollTo]
  );

  const requireRoster = useCallback(
    (fn: () => void) => () => {
      if (!viewer.isRoster) return;
      fn();
    },
    [viewer.isRoster]
  );

  const doMark = useCallback(
    async (row: DeskRow, input: { state: "reviewed" | "snoozed" | "flagged" | "noted"; reason?: string; note?: string; snooze_until?: string }, message: string) => {
      try {
        await mark.mutateAsync({ row, ...input });
        setUndo({
          message,
          action: input.state === "reviewed" ? () => clearMark.mutateAsync(row) : null,
          until: Date.now() + UNDO_REVIEWED_MS,
        });
      } catch (e) {
        errorToast(...formatError(e));
      }
    },
    [mark, clearMark]
  );

  const onSelect = useCallback((row: DeskRow) => setActiveKey(rowKey(row)), []);
  const onOpen = useCallback((row: DeskRow) => {
    setActiveKey(rowKey(row));
    setQuickView(true);
  }, []);
  const closeQuickView = useCallback(() => {
    setQuickView(false);
    setVoteOnOpen(false);
    setRecommendOnOpen(false);
  }, []);
  const onVote = useCallback((row: DeskRow) => {
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
      const idx = ordered.findIndex((r) => r.post_id === row.post_id);
      if (idx >= 0 && idx + 1 < ordered.length) scrollTo(idx + 1);
    },
    [viewer.isRoster, doMark, ordered, scrollTo]
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

  const onReviewedUpToHere = useCallback(() => {
    if (!viewer.isRoster) return;
    const row = activeRow ?? ordered[ordered.length - 1];
    if (!row) return;
    const idx = ordered.findIndex((r) => r.post_id === row.post_id);
    setDialog({ kind: "cursor", row, count: idx + 1 });
  }, [viewer.isRoster, activeRow, ordered]);

  const confirmCursor = useCallback(
    async (row: DeskRow) => {
      setDialog({ kind: "none" });
      const previous = teamCursor;
      try {
        const result = await setCursor.mutateAsync({ post_id: row.post_id, action: "advance" });
        if (!result.moved) {
          setUndo({ message: i18next.t("curation-desk.live.cursor-ahead"), action: null, until: Date.now() + UNDO_REVIEWED_MS });
          return;
        }
        setUndo({
          message: i18next.t("curation-desk.live.cursor-moved", { count: result.swept_count ?? 0 }),
          action:
            viewer.canRewindCursor && previous?.post_id != null
              ? () => setCursor.mutateAsync({ post_id: previous.post_id!, action: "rewind", reason: "undo" })
              : null,
          until: Date.now() + UNDO_CURSOR_MS,
        });
        void tick.tickNow();
      } catch (e) {
        errorToast(...formatError(e));
      }
    },
    [teamCursor, setCursor, viewer.canRewindCursor, tick]
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
      reviewed: requireRoster(() => activeRow && onReviewed(activeRow)),
      reviewedUpToHere: requireRoster(onReviewedUpToHere),
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
        window.open(`/${activeRow.community ?? activeRow.tags?.[0] ?? "hive"}/@${activeRow.author}/${activeRow.permlink}`, "_blank", "noopener");
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
  const empty = !viewer.isLoading && !feed.isLoading && !feed.isFetching && rows.length === 0;

  return (
    <div className="bg-white dark:bg-dark-200 rounded-2xl overflow-hidden" data-curation-queue>
      <CurationHeader
        status={status.data}
        teamCursor={teamCursor}
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
        onSort={(sort) => update({ sort })}
        onReshuffle={reshuffle}
        onReset={reset}
      />
      <CurationSortFilterBar filters={filters} isRoster={viewer.isRoster} communities={communities} onChange={update} />

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

      <div role="feed" aria-busy={feed.isFetching} aria-label={i18next.t("curation-desk.list.aria")} className="border-t border-[--border-color]">
        {feed.isLoading && <CurationQueueSkeleton />}
        {feed.isError && (
          <p className="p-4 text-sm text-red-600 dark:text-red-400" role="alert">
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
            chronological={display.chronological}
            teamCursor={teamCursor}
            hasNextPage={feed.hasNextPage}
            isFetching={feed.isFetching}
            isFetchingNextPage={feed.isFetchingNextPage}
            dataUpdatedAt={feed.dataUpdatedAt}
            fetchNextPage={feed.fetchNextPage}
            onToggleTail={onToggleTail}
            onReviewedUpToHere={onReviewedUpToHere}
            onVisibleRows={onVisibleRows}
            isBusy={setCursor.isPending}
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
        row={quickView ? (activeRow ? rowById.get(activeRow.post_id) ?? activeRow : null) : null}
        neighbour={neighbour}
        viewer={viewer}
        recommendationsEnabled={recommendationsEnabled}
        voteOnOpen={voteOnOpen}
        onVoteHandled={() => setVoteOnOpen(false)}
        recommendOnOpen={recommendOnOpen}
        onRecommendHandled={() => setRecommendOnOpen(false)}
        onClose={closeQuickView}
        onPrev={() => move(-1)}
        onNext={() => move(1)}
        onReviewed={onReviewed}
        onSkip={() => move(1)}
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
      {dialog.kind === "cursor" && (
        <ModalConfirm
          titleText={i18next.t("curation-desk.cursor.confirm-title")}
          descriptionText={i18next.t("curation-desk.cursor.confirm-body", {
            count: dialog.count,
            time: formatUtcHm(dialog.row.created),
          })}
          okText={i18next.t("curation-desk.cursor.confirm-ok")}
          onConfirm={() => void confirmCursor(dialog.row)}
          onCancel={() => setDialog({ kind: "none" })}
        />
      )}
      {dialog.kind === "help" && <ShortcutSheet onHide={() => setDialog({ kind: "none" })} />}
      {!viewer.isRoster && viewer.kind === "member" && (
        <p className="px-3 py-2 text-[11px] text-gray-500 border-t border-[--border-color]">{i18next.t("curation-desk.list.member-hint")}</p>
      )}
    </div>
  );
}


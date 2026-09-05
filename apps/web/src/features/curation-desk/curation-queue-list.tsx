"use client";

import React, { forwardRef, useCallback, useMemo, useRef } from "react";
import i18next from "i18next";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { UilAngleDown, UilAngleUp, UilCheck } from "@tooni/iconscout-unicons-react";
import { Button } from "@ui/button";
import type { CurationTeamCursor } from "@ecency/sdk";
import { CurationQueueRow, type RowActions } from "./curation-queue-row";
import { formatUtcHm } from "./curation-window";
import type { DeskRow, QueueDisplayItem } from "./types";

interface Props extends RowActions {
  items: QueueDisplayItem[];
  activeKey: string | null;
  isRoster: boolean;
  isTrial: boolean;
  username: string | undefined;
  recommendationsEnabled: boolean;
  chronological: boolean;
  teamCursor: CurationTeamCursor | null | undefined;
  hasNextPage: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  dataUpdatedAt: number;
  fetchNextPage: (options?: { cancelRefetch?: boolean }) => Promise<unknown>;
  onToggleTail: (which: "half" | "eighth" | "olderReviewed") => void;
  onReviewedUpToHere: () => void;
  onVisibleRows: (rows: DeskRow[]) => void;
  isBusy: boolean;
}

/**
 * Window-scrolled virtual list. `endReached` is guarded like
 * useBottomPagination: an in-flight fetch is joined, never cancelled.
 */
export const CurationQueueList = forwardRef<VirtuosoHandle, Props>(function CurationQueueList(props, ref) {
  const {
    items,
    activeKey,
    isRoster,
    isTrial,
    username,
    recommendationsEnabled,
    chronological,
    teamCursor,
    hasNextPage,
    isFetching,
    fetchNextPage,
    onToggleTail,
    onReviewedUpToHere,
    onVisibleRows,
    isBusy,
    // Destructured one by one: a rest object is a new identity on every render,
    // so itemContent would be rebuilt and every row re-rendered.
    onSelect,
    onOpen,
    onVote,
    onReviewed,
    onSnooze,
    onFlag,
    onNote,
    onClearMark,
  } = props;
  const isFetchingRef = useRef(isFetching);
  isFetchingRef.current = isFetching;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const endReached = useCallback(() => {
    if (isFetchingRef.current || !hasNextPage) return;
    void fetchNextPage({ cancelRefetch: false });
  }, [hasNextPage, fetchNextPage]);

  const rangeChanged = useCallback(
    (range: { startIndex: number; endIndex: number }) => {
      const rows: DeskRow[] = [];
      for (let i = range.startIndex; i <= range.endIndex && i < itemsRef.current.length; i++) {
        const item = itemsRef.current[i];
        if (item?.type === "row") rows.push(item.row);
      }
      onVisibleRows(rows);
    },
    [onVisibleRows]
  );

  const itemContent = useCallback(
    (_index: number, item: QueueDisplayItem) => {
      switch (item.type) {
        case "row":
          return (
            <CurationQueueRow
              row={item.row}
              isActive={item.key === activeKey}
              isRoster={isRoster}
              isTrial={isTrial}
              username={username}
              recommendationsEnabled={recommendationsEnabled}
              section={item.section}
              late={item.late}
              resurfaced={item.resurfaced}
              belowCursor={item.belowCursor}
              reviewedByCursor={item.reviewedByCursor}
              chronological={chronological}
              windowKind={item.windowKind}
              locked={item.locked}
              voteHidden={item.voteHidden}
              scalePct={item.scalePct}
              onSelect={onSelect}
              onOpen={onOpen}
              onVote={onVote}
              onReviewed={onReviewed}
              onSnooze={onSnooze}
              onFlag={onFlag}
              onNote={onNote}
              onClearMark={onClearMark}
            />
          );
        case "tail":
          return (
            <Button
              appearance="gray-link"
              size="sm"
              full
              className="!justify-start !rounded-none border-b border-[--border-color] text-xs"
              aria-expanded={item.expanded}
              aria-label={i18next.t(`curation-desk.list.tail-${item.window}`, { count: item.count })}
              onClick={() => onToggleTail(item.window)}
              icon={item.expanded ? <UilAngleUp /> : <UilAngleDown />}
              iconPlacement="left"
            >
              {i18next.t(`curation-desk.list.tail-${item.window}`, { count: item.count })}
            </Button>
          );
        case "divider":
          return (
            <div
              role="separator"
              aria-label={i18next.t("curation-desk.list.divider-aria")}
              className="flex items-center gap-2 px-3 py-2 text-xs text-green-700 dark:text-green-400 border-b border-[--border-color] bg-green-50/60 dark:bg-green-900/20"
            >
              <UilCheck className="size-4" aria-hidden />
              <span className="flex-1">
                {teamCursor?.created
                  ? i18next
                      .t("curation-desk.list.divider", {
                        time: formatUtcHm(teamCursor.created),
                        by: teamCursor.set_by ? `@${teamCursor.set_by}` : "",
                      })
                      // A public cursor carries no set_by, so the copy would
                      // end on a dangling separator.
                      .replace(/\s+/g, " ")
                      .replace(/[\s·]+$/, "")
                  : i18next.t("curation-desk.list.divider-none")}
              </span>
              {isRoster && (
                <Button
                  size="xs"
                  appearance="gray-link"
                  className="!rounded-lg"
                  disabled={isBusy}
                  aria-label={i18next.t("curation-desk.list.reviewed-up-to-here")}
                  title={i18next.t("curation-desk.list.reviewed-up-to-here-key")}
                  onClick={onReviewedUpToHere}
                >
                  {i18next.t("curation-desk.list.reviewed-up-to-here")}
                </Button>
              )}
            </div>
          );
        case "older-reviewed":
          return (
            <Button
              appearance="gray-link"
              size="sm"
              full
              className="!justify-start !rounded-none border-b border-[--border-color] text-xs"
              aria-expanded={item.expanded}
              aria-label={i18next.t("curation-desk.list.older-reviewed", { count: item.count })}
              onClick={() => onToggleTail("olderReviewed")}
              icon={item.expanded ? <UilAngleUp /> : <UilAngleDown />}
              iconPlacement="left"
            >
              {i18next.t("curation-desk.list.older-reviewed", { count: item.count })}
            </Button>
          );
      }
    },
    [
      activeKey,
      isRoster,
      isTrial,
      username,
      recommendationsEnabled,
      chronological,
      teamCursor,
      isBusy,
      onToggleTail,
      onReviewedUpToHere,
      onSelect,
      onOpen,
      onVote,
      onReviewed,
      onSnooze,
      onFlag,
      onNote,
      onClearMark,
    ]
  );

  // A component defined inline is a new type on every render, which unmounts
  // and remounts the footer each time.
  const components = useMemo(
    () => ({
      Footer: () =>
        isFetching ? (
          <div className="p-4 text-center text-xs text-gray-500" aria-live="polite">
            {i18next.t("curation-desk.list.loading")}
          </div>
        ) : null,
    }),
    [isFetching]
  );

  return (
    <Virtuoso
      ref={ref}
      useWindowScroll
      data={items}
      computeItemKey={(_i, item) => item.key}
      increaseViewportBy={{ top: 600, bottom: 1200 }}
      endReached={endReached}
      rangeChanged={rangeChanged}
      itemContent={itemContent}
      components={components}
    />
  );
});

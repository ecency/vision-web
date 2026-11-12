"use client";

import React, { ReactNode, useMemo, useRef, useState } from "react";
import { Entry } from "@/entities";
import { Tooltip } from "@ui/tooltip";
import i18next from "i18next";
import { heartSvg } from "@ui/svg";
import usePrevious from "react-use/lib/usePrevious";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { useViewerVote } from "@/core/hooks/use-viewer-vote";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";

const EntryVotesDialog = dynamic(
  () => import("@/features/shared/entry-votes/entry-votes-dialog").then((m) => ({
    default: m.EntryVotesDialog
  })),
  { ssr: false }
);

type SortOption = "reward" | "timestamp" | "voter" | "percent";

interface Props {
  /** Icon sizing convention (docs/icons.md): a size-N sink class for the vote
   *  icon, e.g. "size-4 [&>svg]:size-full". Defaults to "[&>svg]:size-3.5"
   *  (14px), the feed/discussion tier; waves and decks pass the 16px form. */
  iconSizeClass?: string;
  entry: Entry;
  icon?: ReactNode;
  hideCount?: boolean;
}

export function EntryVotes({
  entry: initialEntry,
  icon,
  hideCount = false,
  iconSizeClass = "[&>svg]:size-3.5"
}: Props) {
  const { data: entry, dataUpdatedAt: entryUpdatedAt } = useQuery(
    EcencyEntriesCacheManagement.getEntryQuery(initialEntry)
  );
  const previousEntry = usePrevious(entry);

  const [visible, setVisible] = useState(false);

  // The user's own vote (never the vote of the observer the entry was read for).
  const viewerVote = useViewerVote(entry, entryUpdatedAt);
  const isVoted = viewerVote.upVoted || viewerVote.downVoted;

  // Count: stats.total_votes. active_votes.length is only a fallback for rows
  // without stats (it stopped at 1000 on v1, and v2 rows carry no list).
  const totalVotes = useMemo(
    () =>
      entry?.stats?.total_votes ||
      (entry?.active_votes && entry?.active_votes?.length) ||
      entry?.net_votes ||
      entry?.total_votes ||
      0,
    [entry]
  );
  const title = useMemo(
    () =>
      totalVotes === 0
        ? i18next.t("entry-votes.title-empty")
        : totalVotes === 1
          ? i18next.t("entry-votes.title")
          : i18next.t("entry-votes.title-n", { n: totalVotes }),
    [totalVotes]
  );
  // "vote-done" pulse: the count moved while this entry is shown and the user
  // now has a vote on it (their own vote just landed).
  const previousTotal =
    previousEntry?.stats?.total_votes ||
    previousEntry?.active_votes?.length ||
    previousEntry?.net_votes ||
    previousEntry?.total_votes ||
    0;
  const hasDifferentVotes = !!previousEntry && previousTotal !== totalVotes;
  const hasCurrentUserVote = isVoted;

  const countClassName = `entry-votes__count${hideCount ? " entry-votes__count--hidden" : ""}`;

  // Ref guard for the count tick: remember the first-seen count (per entry, so
  // a list-recycled instance never ticks when handed a different post) and
  // animate only when the number changes after mount — never on first paint.
  const entryKey = `${entry?.author}/${entry?.permlink}`;
  const firstSeenVotes = useRef({ entryKey, count: totalVotes });
  if (firstSeenVotes.current.entryKey !== entryKey) {
    firstSeenVotes.current = { entryKey, count: totalVotes };
  }
  const countChanged = totalVotes !== firstSeenVotes.current.count;

  const child = (
    <>
      <div
        className={`heart-icon ${isVoted ? "voted" : ""} ${
          hasDifferentVotes && hasCurrentUserVote ? "vote-done" : ""
        } ${iconSizeClass ?? ""}`}
      >
        {icon ?? heartSvg}
      </div>
      <span
        key={totalVotes}
        className={`${countClassName}${countChanged ? " animate-tick" : ""}`}
        aria-hidden={hideCount}
      >
        {totalVotes}
      </span>
    </>
  );

  if (totalVotes === 0) {
    return (
      <div className="entry-votes notranslate">
        <Tooltip content={title}>
          <span className="inner-btn no-data">{child}</span>
        </Tooltip>
      </div>
    );
  }

  return (
    <>
      <div className="entry-votes notranslate">
        <Tooltip content={title}>
          <span
            className="inner-btn"
            role="button"
            tabIndex={0}
            onClick={() => setVisible(!visible)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setVisible(!visible);
              }
            }}
          >
            {child}
          </span>
        </Tooltip>
      </div>
      {visible && (
        <EntryVotesDialog
          hasDifferentVotes={hasDifferentVotes}
          totalVotes={totalVotes}
          entry={entry}
          onHide={() => setVisible(false)}
        />
      )}
    </>
  );
}

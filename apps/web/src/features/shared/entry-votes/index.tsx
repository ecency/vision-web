"use client";

import React, { ReactNode, useMemo, useRef, useState } from "react";
import { Entry } from "@/entities";
import { Tooltip } from "@ui/tooltip";
import i18next from "i18next";
import { heartSvg } from "@ui/svg";
import usePrevious from "react-use/lib/usePrevious";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { useActiveAccount } from "@/core/hooks/use-active-account";
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
  const { data: entry } = useQuery(EcencyEntriesCacheManagement.getEntryQuery(initialEntry));
  const previousEntry = usePrevious(entry);

  const { activeUser } = useActiveAccount();

  const [visible, setVisible] = useState(false);

  const { voted: isVoted } = useMemo(() => {
    if (!activeUser || !entry) {
      return { voted: false };
    }
    const { active_votes: votes } = entry;

    const voted = votes ? votes.some((v) => v.voter === activeUser.username) : false;

    return { voted };
  }, [activeUser, entry]);

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
  const hasDifferentVotes = previousEntry?.active_votes?.length !== entry?.active_votes?.length;
  const hasCurrentUserVote = entry?.active_votes?.find(
    ({ voter }) => voter === activeUser?.username
  );

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

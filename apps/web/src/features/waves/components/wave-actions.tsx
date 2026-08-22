import {
  EntryMenu,
  EntryPayout,
  EntryStats,
  EntryTipBtn,
  EntryVoteBtn,
  EntryVotes,
  UserAvatar
} from "@/features/shared";
import { TranslateChip } from "@/features/shared/entry-translate/translate-chip";
import { voteSvg } from "@/app/decks/_components/icons";
import { Button } from "@ui/button";
import i18next from "i18next";
import React, { ReactNode } from "react";
import { WaveEntry } from "@/entities";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { PostTipsResponse } from "@ecency/sdk";
import { commentSvg } from "@ui/svg";

interface Props {
  status: string;
  entry: WaveEntry;
  onEntryView: () => void;
  commentsSlot?: ReactNode;
  hasParent: boolean;
  pure: boolean;
  onEdit: (entry: WaveEntry) => void;
  onSeeFullThread?: () => void;
  showStats?: boolean;
  showVoteSummary?: boolean;
  showCommentCount?: boolean;
  showPayout?: boolean;
  postTips?: PostTipsResponse;
}

export function WaveActions({
  status,
  entry,
  onEntryView,
  commentsSlot,
  onSeeFullThread,
  pure,
  hasParent,
  onEdit,
  showStats = false,
  showVoteSummary = true,
  showCommentCount = true,
  showPayout = true,
  postTips
}: Props) {
  const { activeUser } = useActiveAccount();

  return (
    <>
      {status === "default" && (
        <div className="thread-item-actions" onClick={(e) => e.stopPropagation()}>
          <div>
            <EntryVoteBtn entry={entry!} isPostSlider={false} />
            {showPayout && <EntryPayout entry={entry!} />}
            {showStats && <EntryStats entry={entry!} iconClassName="!size-4" />}
            <EntryVotes
              entry={entry!}
              icon={voteSvg}
              hideCount={!showVoteSummary}
              iconSizeClass="[&>svg]:size-4"
            />
            <Button
              iconPlacement="left"
              size="sm"
              appearance="gray-link"
              icon={
                <span className="inline-flex !size-4 [&>svg]:size-full">{commentSvg}</span>
              }
              onClick={() => onEntryView()}
              aria-label={i18next.t("waves.reply")}
              title={i18next.t("waves.reply")}
            >
              <div
                className={`wave-actions__comment-count${showCommentCount ? "" : " wave-actions__comment-count--hidden"}`}
                aria-hidden={!showCommentCount}
              >
                {commentsSlot ?? entry?.children}
              </div>
            </Button>
            <EntryTipBtn
              entry={entry!}
              postTips={postTips}
              tipCount={entry?.tip_count}
              tippedByViewer={entry?.tipped_by_viewer}
            />
          </div>
          <div>
            <TranslateChip entry={entry!} />
            <EntryMenu entry={entry!} compact={true} />
            {activeUser?.username === entry?.author && (
              <Button className="edit-btn" appearance="link" onClick={() => onEdit(entry!)}>
                {i18next.t("decks.columns.edit-wave")}
              </Button>
            )}
          </div>
        </div>
      )}
      {hasParent && !pure && (
        <div className="thread-item-parent">
          <UserAvatar size="small" username={entry?.parent_author!!} />
          <Button appearance="link" className="host" onClick={onSeeFullThread}>
            {i18next.t("decks.columns.see-full-thread")}
          </Button>
        </div>
      )}
    </>
  );
}

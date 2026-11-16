import React, { useState } from "react";
import "./_deck-post-viewer.scss";
import useMount from "react-use/lib/useMount";
import { DeckPostViewerCommentBox } from "./deck-post-viewer-comment-box";
import { voteSvg } from "../../icons";
import { Button } from "@ui/button";
import { Entry } from "@/entities";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { arrowLeftSvg, commentSvg } from "@ui/svg";
import i18next from "i18next";
import {
  EntryInfo,
  EntryTipBtn,
  EntryVoteBtn,
  EntryVotes,
  PostContentRenderer
} from "@/features/shared";
import { Discussion } from "@/features/shared/discussion";
import { makeEntryPath } from "@/utils";
import { useQuery } from "@tanstack/react-query";

interface Props {
  entry: Entry;
  backTitle?: string;
  onClose: () => void;
}

export const DeckPostViewer = ({ entry: initialEntry, onClose, backTitle }: Props) => {
  const [isMounted, setIsMounted] = useState(false);

  const { data: entry } = useQuery(EcencyEntriesCacheManagement.getEntryQuery(initialEntry));

  useMount(() => setIsMounted(true));

  return entry ? (
    <div className={"deck-post-viewer " + (isMounted ? "visible" : "")}>
      <div className="deck-post-viewer-header">
        <div className="actions flex pt-3 mr-3">
          <Button
            appearance="link"
            onClick={() => {
              setIsMounted(false);
              onClose();
            }}
            icon={arrowLeftSvg}
            iconPlacement="left"
          >
            {backTitle}
          </Button>
          <Button
            className="flex pt-[0.35rem]"
            outline={true}
            href={makeEntryPath(entry.category, entry.author, entry.permlink)}
            target="_blank"
            size="sm"
          >
            {i18next.t("decks.columns.view-full-post")}
          </Button>
        </div>
        <div className="title p-3 pb-4 flex">
          <span>{entry.title}</span>
        </div>
      </div>
      <div className="px-3">
        <EntryInfo entry={entry} />
      </div>
      <div className="px-3 pb-4">
        <PostContentRenderer value={entry.body} images={entry.json_metadata?.image} />
      </div>
      <div className="bottom-actions p-3">
        <EntryVoteBtn entry={entry} isPostSlider={false} />
        <EntryVotes entry={entry} icon={voteSvg} iconSizeClass="[&>svg]:size-4" />
        <div className="flex items-center comments">
          <div aria-hidden="true" className="inline-flex shrink-0 size-4 [&>svg]:size-full mr-1">
            {commentSvg}
          </div>
          {entry.children}
        </div>
        <EntryTipBtn entry={entry} />
      </div>
      <div className="px-3 dark:[&>*>.comment-preview]:bg-dark-default">
        <DeckPostViewerCommentBox
          key={`${entry.author}/${entry.permlink}`}
          entry={entry}
          onReplied={() => {}}
        />
      </div>
      <div className="px-3">
        <Discussion parent={entry} community={null} hideControls={false} isRawContent={false} />
      </div>
    </div>
  ) : (
    <></>
  );
};

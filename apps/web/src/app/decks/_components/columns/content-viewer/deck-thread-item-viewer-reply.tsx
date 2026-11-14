import { ThreadItem } from "../deck-items";
import { DeckThreadsForm } from "../../deck-threads-form";
import React, { useState } from "react";
import "./_deck-thread-item-viewer-reply.scss";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { classNameObject } from "@ui/util";
import i18next from "i18next";
import { WaveEntry } from "@/entities";
import { entryKey } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";

interface Props {
  entry: WaveEntry;
  isHighlighted?: boolean;
  parentEntry: WaveEntry;
  incrementParentEntryCount: () => void;
}

export const DeckThreadItemViewerReply = ({
  entry: initialEntry,
  isHighlighted,
  parentEntry,
  incrementParentEntryCount
}: Props) => {
  const { data: entry } = useQuery(EcencyEntriesCacheManagement.getEntryQuery(initialEntry));
  const { addReply } = EcencyEntriesCacheManagement.useAddReply(entry);
  const { updateRepliesCount } = EcencyEntriesCacheManagement.useUpdateRepliesCount(entry);

  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className={classNameObject({
        "deck-thread-item-viewer-reply": true,
        highlighted: isHighlighted
      })}
    >
      <ThreadItem
        pure={true}
        initialEntry={entry!}
        onMounted={() => {}}
        onResize={() => {}}
        sequenceItem={isExpanded}
        onEntryView={() => setIsExpanded(!isExpanded)}
        commentsSlot={isExpanded ? <>{i18next.t("decks.columns.hide-replies")}</> : undefined}
      />
      {isExpanded && (
        <DeckThreadsForm
          inline={true}
          placeholder={i18next.t("decks.threads-form.write-your-reply")}
          replySource={entry}
          onSuccess={(reply) => {
            // Update entry in global cache
            addReply(reply);
            incrementParentEntryCount();
          }}
        />
      )}
      {isExpanded && (
        <div className="deck-thread-item-viewer-reply-sequence">
          {entry?.replies.map((reply) => (
            <DeckThreadItemViewerReply
              key={entryKey(reply)}
              entry={reply}
              parentEntry={entry}
              incrementParentEntryCount={() => updateRepliesCount(parentEntry.children + 1)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

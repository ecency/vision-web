import { useResizeDetector } from "react-resize-detector";
import React, { JSX, useEffect, useState } from "react";
import { IdentifiableEntry } from "../deck-threads-manager";
import { DeckThreadItemBody } from "./deck-thread-item-body";
import { useInViewport } from "react-in-viewport";
import { isLocalEntry, useEntryChecking } from "../../utils";
import { DeckThreadItemHeader } from "./deck-thread-item-header";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { Entry, WaveEntry } from "@/entities";
import { classNameObject } from "@ui/util";
import { PollWidget, useEntryPollExtractor } from "@/features/polls";
import i18next from "i18next";
import { dateToRelative } from "@/utils";
import useMount from "react-use/lib/useMount";
import { WaveActions } from "@/features/waves";
import { useQuery } from "@tanstack/react-query";

export interface ThreadItemProps {
  initialEntry: WaveEntry;
  onMounted: () => void;
  onEntryView: () => void;
  onResize: () => void;
  pure?: boolean;
  hideHost?: boolean;
  sequenceItem?: boolean;
  commentsSlot?: JSX.Element;
  onSeeFullThread?: () => void;
  onAppear?: () => void;
  onEdit?: (entry: IdentifiableEntry) => void;
  visible?: boolean;
  triggerPendingStatus?: boolean;
}

export const ThreadItem = ({
  initialEntry,
  onMounted,
  onEntryView,
  onResize,
  pure = false,
  sequenceItem,
  commentsSlot,
  onSeeFullThread,
  onAppear,
  onEdit = () => {},
  visible = true,
  triggerPendingStatus = false
}: ThreadItemProps) => {
  const { height, ref } = useResizeDetector();
  const { inViewport } = useInViewport(ref);
  const { data: entry } =
    useQuery(EcencyEntriesCacheManagement.getEntryQuery<WaveEntry>(initialEntry));

  const [renderInitiated, setRenderInitiated] = useState(false);
  const [hasParent, setHasParent] = useState(false);
  const [status, setStatus] = useState<"default" | "pending">("default");
  const [intervalStarted, setIntervalStarted] = useState(false);

  const poll = useEntryPollExtractor(entry);
  const { updateEntryQueryData } = EcencyEntriesCacheManagement.useUpdateEntry();

  useEntryChecking(entry, intervalStarted, (nextEntry) => {
    updateEntryQueryData([
      { ...nextEntry, host: initialEntry.host, container: initialEntry.container } as Entry
    ]);
    setIntervalStarted(false);
  });

  useMount(() => {
    onMounted();
  });

  useEffect(() => {
    if (triggerPendingStatus) {
      setStatus("pending");
    }
  }, [triggerPendingStatus]);

  useEffect(() => {
    setIntervalStarted(!!entry && isLocalEntry(entry));
  }, [entry]);

  useEffect(() => {
    if (inViewport && onAppear) {
      onAppear();
    }
  }, [inViewport, onAppear]);

  useEffect(() => {
    setHasParent(
      !!entry?.parent_author && !!entry?.parent_permlink && entry?.parent_author !== entry?.host
    );
  }, [entry]);

  useEffect(() => {
    if (entry?.updated !== entry?.created) {
      setStatus("default");
    }
  }, [entry]);

  return (
    <div
      ref={ref}
      className={classNameObject({
        "thread-item border-b border-[--border-color]": true,
        "has-parent": hasParent && !pure,
        pure,
        "sequence-item": sequenceItem,
        pending: status === "pending",
        hidden: !visible
      })}
      role="button"
      tabIndex={0}
      aria-label={i18next.t("decks.columns.view-full-post", { defaultValue: "View full post" })}
      onClick={(event) => {
        if (event.target === ref.current) {
          onEntryView();
        }
      }}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && event.target === ref.current) {
          event.preventDefault();
          onEntryView();
        }
      }}
    >
      <DeckThreadItemHeader status={status} entry={entry!} hasParent={hasParent} pure={pure} />
      <DeckThreadItemBody
        entry={entry!}
        height={height}
        renderInitiated={renderInitiated}
        setRenderInitiated={setRenderInitiated}
        onResize={onResize}
      />
      {poll && (
        <div className="p-4">
          <PollWidget entry={entry} compact={true} poll={poll} isReadOnly={false} />
        </div>
      )}
      {entry?.updated !== entry?.created && (
        <div className="px-3 pb-3 updated-label">
          {i18next.t("decks.columns.updated", { n: dateToRelative(entry!.updated) })}
        </div>
      )}
      <WaveActions
        entry={entry!}
        status={status}
        pure={pure}
        onEntryView={onEntryView}
        hasParent={hasParent}
        commentsSlot={commentsSlot}
        onEdit={onEdit}
        onSeeFullThread={onSeeFullThread}
      />
    </div>
  );
};

import { useState } from "react";
import { WaveEntry } from "@/entities";
import i18next from "i18next";
import { WavesListItem } from "@/app/waves/_components";
import { classNameObject } from "@ui/util";
import { WaveForm } from "@/features/waves";
import { useEntryDiscussionsList } from "@/features/entry-management";
import { UilCommentAdd } from "@tooni/iconscout-unicons-react";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { useQuery } from "@tanstack/react-query";
import { entryKey } from "@ecency/sdk";

interface Props {
  item: WaveEntry;
  i: number;
}

export function WaveViewDiscussionItem({ item, i }: Props) {
  const [expanded, setExpanded] = useState(false);

  const data = useEntryDiscussionsList(item);
  const { data: entry } = useQuery(EcencyEntriesCacheManagement.getEntryQuery(item));

  return (
    <div
      className={classNameObject({
        "[&_.waves-list-item]:rounded-none first:rounded-t-2xl last:rounded-b-2xl border-[--border-color]":
          true,
        "border-b last:border-b-0": !expanded,
        "border-y-4 first:border-t-0 last:border-b-0": expanded
      })}
    >
      <WavesListItem
        key={entryKey(entry!)}
        item={entry as WaveEntry}
        i={i}
        commentSlot={expanded ? i18next.t("waves.hide-replies") : undefined}
        onExpandReplies={() => setExpanded(!expanded)}
      />
      {expanded && (
        <div className="animate-fade-in-up relative reading-surface [&_.wave-form]:border-b [&_.wave-form]:border-[--border-color]">
          <WaveForm entry={undefined} replySource={entry} />
          {data?.map((reply, j) => (
            <WaveViewDiscussionItem item={reply as WaveEntry} i={j} key={j} />
          ))}
          {data?.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-4 p-4 md:py-6 lg:py-8 text-gray-400 dark:text-gray-600">
              <UilCommentAdd className="size-6" />
              {i18next.t("waves.no-replies")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

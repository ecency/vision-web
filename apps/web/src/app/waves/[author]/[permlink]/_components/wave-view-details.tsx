"use client";

import { WavesListItemHeader } from "@/app/waves/_components/waves-list-item-header";
import { WaveActions, WaveForm } from "@/features/waves";
import { WaveEntry } from "@/entities";
import React, { useCallback, useRef, useState } from "react";
import { Modal, ModalHeader } from "@ui/modal";
import i18next from "i18next";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import useMount from "react-use/lib/useMount";
import { PostContentRenderer } from "@/features/shared";
import { PollWidget, useEntryPollExtractor } from "@/features/polls";
import { usePathname, useRouter } from "next/navigation";
import { useOptionalWavesTagFilter } from "@/app/waves/_context";
import { useWaveImageGrid } from "@/app/waves/_hooks";
import { getPostTipsQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { useGlobalStore } from "@/core/global-store";
import { WaveNsfwGate } from "@/app/waves/_components/wave-nsfw-gate";
import { isRememberedNsfwWave, waveNeedsNsfwCover } from "@/app/waves/_utils/wave-nsfw";

interface Props {
  entry: WaveEntry;
}

export function WaveViewDetails({ entry: initialEntry }: Props) {
  const { data: entry } = useQuery(EcencyEntriesCacheManagement.getEntryQuery(initialEntry));

  const contentRef = useRef<HTMLDivElement>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const tagFilter = useOptionalWavesTagFilter();

  const poll = useEntryPollExtractor(entry);
  const { data: postTips } = useQuery(getPostTipsQueryOptions(entry?.author ?? "", entry?.permlink ?? ""));

  const status = "default";

  // This entry comes from the chain, which carries the author's nsfw tag but not
  // the image check's verdict. The verdict is known only when the wave was seen
  // flagged in a feed during this visit; see rememberNsfwWave.
  const globalNsfw = useGlobalStore((s) => s.nsfw);
  const [nsfwRevealed, setNsfwRevealed] = useState(false);
  const nsfwCovered =
    !globalNsfw &&
    !nsfwRevealed &&
    (waveNeedsNsfwCover(initialEntry, entry) ||
      isRememberedNsfwWave(initialEntry.author, initialEntry.permlink));

  useMount(() => window.scrollTo(0, 0));
  useWaveImageGrid(contentRef, entry?.body);

  const handleTagClick = useCallback(
    (tag: string) => {
      if (!tagFilter) {
        return;
      }

      tagFilter.setSelectedTag(tag);

      if (pathname !== "/waves") {
        router.push("/waves");
      }
    },
    [pathname, router, tagFilter]
  );

  return (
    <div className="relative z-10 rounded-2xl reading-surface cursor-pointer">
      <div className="sticky top-0 z-20 rounded-t-2xl reading-surface border-b border-[--border-color]">
        <WavesListItemHeader
          interactable={false}
          entry={entry!}
          hasParent={false}
          pure={false}
          status={status}
          className="py-4"
          onClose={() => router.back()}
        />
      </div>
      <div ref={contentRef} className="p-4">
        <WaveNsfwGate covered={nsfwCovered} onReveal={() => setNsfwRevealed(true)}>
          <PostContentRenderer
            value={entry?.body ?? ""}
            images={entry?.json_metadata?.image}
            renderOptions={{ embedVideosDirectly: true }}
            onTagClick={tagFilter ? handleTagClick : undefined}
          />
        </WaveNsfwGate>
        {poll && <PollWidget entry={entry} poll={poll} isReadOnly={false} />}
      </div>
      <WaveActions
        showStats={true}
        status={status}
        entry={entry!}
        onEntryView={() => {}}
        hasParent={false}
        pure={false}
        onEdit={() => setShowEditModal(true)}
        postTips={postTips}
      />
      <div className="border-t border-[--border-color]"></div>
      <WaveForm entry={undefined} replySource={entry} />

      <Modal centered={true} show={showEditModal} onHide={() => setShowEditModal(false)}>
        <ModalHeader closeButton={true}>{i18next.t("waves.edit-wave")}</ModalHeader>
        <WaveForm entry={entry} onSuccess={() => setShowEditModal(false)} />
      </Modal>
    </div>
  );
}

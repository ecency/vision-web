"use client";

import { Entry, WaveEntry } from "@/entities";
import { DecentMemesPayload } from "@/api/decentmemes";
import { useWaveCreate } from "@/features/waves/components/wave-form/api";
import { useWaveCreateReply } from "@/features/waves/components/wave-form/api/use-wave-create-reply";
import { usePublishHandoffWriter } from "@/app/publish/_hooks";
import { useGlobalStore } from "@/core/global-store";
import { useMutation } from "@tanstack/react-query";
import { error, success } from "@/features/shared";
import i18next from "i18next";
import { useActiveAccount } from "@/core/hooks";
import { getQueryClient } from "@/core/react-query";
import { getAccountFullQueryOptions } from "@ecency/sdk";
import { scheduleQuestsRefresh } from "@/utils/refresh-quests";
import { latchWavesOnboardingItem } from "@/features/waves/components/waves-onboarding-checklist/derive-waves-onboarding-state";
import { openInNewTab } from "@/utils/open-in-new-tab";

interface Body {
  text: string;
  image: string;
  imageName: string;
  video: string;
  videoThumbnail: string;
  host: string;
  decentMemes?: DecentMemesPayload;
}

export function useWaveSubmit(
  editingEntry?: WaveEntry,
  replySource?: Entry,
  onSuccess?: (item: WaveEntry) => void
) {
  const { username, account, isLoading } = useActiveAccount();
  const toggleUIProp = useGlobalStore((s) => s.toggleUiProp);

  const { mutateAsync: create } = useWaveCreate();
  const { mutateAsync: createReply } = useWaveCreateReply();

  const stageForPublish = usePublishHandoffWriter();

  return useMutation({
    mutationKey: ["wave-form-submit", username, replySource, editingEntry],
    mutationFn: async ({
      text,
      image,
      imageName,
      video,
      videoThumbnail,
      host,
      decentMemes
    }: Body) => {
      // Check if user is logged in
      if (!username) {
        toggleUIProp("login");
        return;
      }

      // If account is still loading, wait for it
      if (isLoading) {
        // Refetch to ensure we have fresh data
        const accountData = await getQueryClient().fetchQuery(getAccountFullQueryOptions(username));
        if (!accountData) {
          error(i18next.t("g.server-error"));
          return;
        }
      } else if (!account) {
        // Account should exist but doesn't - show error
        error(i18next.t("g.server-error"));
        return;
      }

      let content = text!!;

      const isReply = Boolean(replySource || editingEntry?.depth || editingEntry?.parent_author);
      const characterLimit = isReply ? 750 : 250;
      const textLength = text!!.length;

      if (image) {
        content = `${content}<br>![${imageName ?? ""}](${image})`;
      }

      if (video) {
        content = `${content}<br>${video}`;
      }

      // Too long for a wave, so hand the built content with its attachments to
      // the publish composer instead.
      if (!isReply && textLength > characterLimit) {
        stageForPublish(content);
        openInNewTab("/publish");
        return;
      }

      if (isReply && textLength > characterLimit) {
        error(i18next.t("decks.threads-form.max-length"));
        return;
      }

      let threadItem: WaveEntry;

      if (content === editingEntry?.body) {
        return;
      }

      if (replySource) {
        threadItem = (await createReply({
          parent: replySource,
          raw: content,
          editingEntry: editingEntry,
          videoThumbnail: videoThumbnail || undefined,
          decentMemes
        })) as WaveEntry;
        if (host) {
          threadItem.host = host;
        }
      } else {
        const created = await create({
          host,
          raw: content,
          editingEntry,
          videoThumbnail: videoThumbnail || undefined,
          decentMemes
        });
        threadItem = created.entry;
        // For a NEW wave, reflect the container create() actually resolved
        // (hive.flow vs ecency.waves). For an edit, created.entry already
        // carries the wave's existing host (it's the edited entry); don't
        // relabel it to the resolved host, or the cached edit could end up
        // under the wrong container once hive.flow is live.
        if (!editingEntry) {
          threadItem.host = created.host ?? host;
        }
      }

      threadItem.id = threadItem.post_id;

      return threadItem;
    },
    onSuccess: (item) => {
      if (editingEntry) {
        success(i18next.t("waves.success-reply-edit"));
      }
      if (item) {
        onSuccess?.(item);
        scheduleQuestsRefresh(getQueryClient(), username);
        // A wave or a reply to a wave completes an onboarding checklist item the
        // quests API cannot signal (both are comment activity on chain). Latch it
        // scoped to the wave's actual author — not the active account, which may
        // have changed while this async submit was in flight — so the correct
        // user is credited. Edits complete nothing.
        if (!editingEntry && item.author) {
          latchWavesOnboardingItem(item.author, replySource ? "reply" : "wave");
        }
      }
    }
  });
}

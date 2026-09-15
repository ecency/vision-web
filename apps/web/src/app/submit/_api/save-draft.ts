import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useContext } from "react";
import { PollsContext } from "@/app/submit/_hooks/polls-manager";
import { BeneficiaryRoute, Draft, DraftMetadata, RewardType } from "@/entities";
import { EntryMetadataManagement } from "@/features/entry-management";
import { addDraft, updateDraft } from "@ecency/sdk";
import i18next from "i18next";
import { success, error } from "@/features/shared";
import { QueryKeys } from "@ecency/sdk";
import { useRouter } from "next/navigation";
import { postBodySummary } from "@ecency/render-helper";
import { usableDescription } from "@/app/publish/_utils/content";
import { EcencyAnalytics } from "@ecency/sdk";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { ensureValidToken } from "@/utils";
import { getCreatedDraft } from "@/app/publish/_utils/get-created-draft";

export function useSaveDraftApi(onDraftCreated?: (draft: Draft) => void) {
  const { username } = useActiveAccount();
  const { activePoll, clearActivePoll } = useContext(PollsContext);

  const router = useRouter();
  const queryClient = useQueryClient();

  const { mutateAsync: recordActivity } = EcencyAnalytics.useRecordActivity(
    username ?? undefined,
    "legacy-draft-created"
  );

  return useMutation({
    mutationKey: ["saveDraft"],
    mutationFn: async ({
      title,
      body,
      tags,
      editingDraft,
      beneficiaries,
      reward,
      description,
      selectedThumbnail
    }: {
      title: string;
      body: string;
      tags: string[];
      editingDraft: Draft | null;
      beneficiaries: BeneficiaryRoute[];
      reward: RewardType;
      description: string | null;
      selectedThumbnail?: string;
    }) => {
      const tagJ = tags.join(" ");

      const metaBuilder = await EntryMetadataManagement.EntryMetadataManager.shared
        .builder()
        .default()
        .extractFromBody(body)
        .withTags(tags)
        // Use the author's description unless it is empty or too short to be meaningful
        .withSummary(usableDescription(description) ?? postBodySummary(body))
        .withSelectedThumbnail(selectedThumbnail);

      const meta = metaBuilder.build();
      const draftMeta: DraftMetadata = {
        ...meta,
        beneficiaries: beneficiaries ?? [],
        rewardType: reward ?? "default",
        poll: activePoll
      };

      try {
        if (!username) {
          return;
        }

        const token = await ensureValidToken(username);

        if (editingDraft) {
          await updateDraft(
            token,
            editingDraft._id,
            title,
            body,
            tagJ,
            draftMeta
          );
          success(i18next.t("submit.draft-updated"));

          // Construct the updated draft with fresh data
          const updatedDraft: Draft = {
            ...editingDraft,
            title,
            body,
            tags: tagJ,
            tags_arr: tags,
            meta: draftMeta,
            modified: new Date().toISOString()
          };

          // Update regular query cache
          queryClient.setQueryData(
            QueryKeys.posts.drafts(username),
            (oldDrafts: Draft[] | undefined) => {
              if (!oldDrafts) return oldDrafts;
              return oldDrafts.map((d) => (d._id === editingDraft._id ? updatedDraft : d));
            }
          );
          // Invalidate infinite query so drafts list refetches fresh data
          queryClient.invalidateQueries({ queryKey: QueryKeys.posts.draftsInfinite(username) });

          clearActivePoll();
          return { draft: updatedDraft, isNew: false };
        } else {
          const previousDrafts =
            queryClient.getQueryData<Draft[]>(QueryKeys.posts.drafts(username)) ?? [];
          const resp = await addDraft(token, title, body, tagJ, draftMeta);
          success(i18next.t("submit.draft-saved"));

          recordActivity();

          const { drafts } = resp;
          const draft = getCreatedDraft(previousDrafts, drafts);

          // Update regular query cache and invalidate infinite query
          queryClient.setQueryData(QueryKeys.posts.drafts(username), drafts);
          queryClient.invalidateQueries({ queryKey: QueryKeys.posts.draftsInfinite(username) });

          // Update URL without navigation to reflect that we're now editing a draft
          router.replace(`/draft/${draft._id}`, { scroll: false });

          // Notify parent component about the new draft
          if (onDraftCreated) {
            onDraftCreated(draft);
          }

          clearActivePoll();
          return { draft, isNew: true };
        }
      } catch (e) {
        error(i18next.t("g.server-error"));
      }
    }
  });
}

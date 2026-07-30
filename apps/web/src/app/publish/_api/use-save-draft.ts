import { addDraft, updateDraft, QueryKeys } from "@ecency/sdk";
import { Draft, DraftMetadata, RewardType } from "@/entities";
import { EntryMetadataManagement } from "@/features/entry-management";
import { error, success, info } from "@/features/shared";
import { postBodySummary } from "@ecency/render-helper";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import i18next from "i18next";
import { useRouter } from "next/navigation";
import { usePublishState } from "../_hooks";
import { useOptionalUploadTracker } from "../_hooks/use-upload-tracker";
import { EcencyAnalytics } from "@ecency/sdk";
import { formatError } from "@/api/format-error";
import { SUBMIT_DESCRIPTION_MAX_LENGTH } from "@/app/submit/_consts";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { ensureValidToken } from "@/utils";
import { getCreatedDraft } from "../_utils/get-created-draft";

export type SaveDraftOptions = {
  showToast?: boolean;
  redirect?: boolean;
  /**
   * Draft to write, overriding the one this hook was built with.
   *
   * The hook-level id comes from React state, so it is a render behind: a save
   * queued directly after the create that produced the id would still be bound
   * to `undefined` and create a *second* draft. The queue passes the id it just
   * received through here instead of waiting for a re-render.
   */
  draftId?: string;
};

export function useSaveDraftApi(draftId?: string) {
  const { activeUser } = useActiveAccount();

  const router = useRouter();
  const queryClient = useQueryClient();
  const uploadTracker = useOptionalUploadTracker();

  const {
    title,
    content,
    tags,
    beneficiaries,
    reward,
    metaDescription,
    selectedThumbnail,
    poll,
    postLinks,
    location,
    decentMemes,
    aiTools
  } = usePublishState();

  const { mutateAsync: recordActivity } = EcencyAnalytics.useRecordActivity(
    activeUser?.username,
    "draft-created"
  );

  return useMutation({
    mutationKey: ["saveDraft-2.0", draftId],
    mutationFn: async ({
      showToast = true,
      redirect = true,
      draftId: draftIdOverride
    }: SaveDraftOptions = {}) => {
      const targetDraftId = draftIdOverride ?? draftId;
      if (!activeUser?.username) {
        throw new Error("[Draft] No active user");
      }

      const username = activeUser.username;

      const tagJ = tags?.join(" ");

      const metaBuilder = await EntryMetadataManagement.EntryMetadataManager.shared
        .builder()
        .default()
        .extractFromBody(content!)
        .withTags(tags)
        // It should select filled description or if its empty or null/undefined then get auto summary
        .withSummary(metaDescription! || postBodySummary(content!, SUBMIT_DESCRIPTION_MAX_LENGTH))
        .withPostLinks(postLinks)
        .withLocation(location)
        .withAiTools(aiTools)
        .withSelectedThumbnail(selectedThumbnail);

      const meta = metaBuilder.build();
      const draftMeta: DraftMetadata = {
        ...meta,
        beneficiaries: beneficiaries ?? [],
        rewardType: (reward as RewardType) ?? "default",
        poll,
        decentMemes: decentMemes ?? []
      };

      const token = await ensureValidToken(username);

      if (targetDraftId) {
        const resp = await updateDraft(
          token,
          targetDraftId,
          title!,
          content!,
          tagJ!,
          draftMeta
        );
        if (showToast) {
          success(i18next.t("submit.draft-updated"));
        }

        queryClient.setQueryData(QueryKeys.posts.drafts(username), resp.drafts);
        queryClient.invalidateQueries({ queryKey: QueryKeys.posts.draftsInfinite(username) });
      } else {
        const previousDrafts =
          queryClient.getQueryData<Draft[]>(QueryKeys.posts.drafts(username)) ?? [];
        const resp = await addDraft(
          token,
          title!,
          content!,
          tagJ!,
          draftMeta
        );
        if (showToast) {
          success(i18next.t("submit.draft-saved"));
        }

        const { drafts } = resp;
        const draft = getCreatedDraft(previousDrafts, drafts);

        queryClient.setQueryData(QueryKeys.posts.drafts(username), drafts);
        queryClient.invalidateQueries({ queryKey: QueryKeys.posts.draftsInfinite(username) });

        if (redirect) {
          // Wait for any pending uploads before redirecting
          if (uploadTracker?.hasPendingUploads) {
            info(i18next.t("publish.waiting-for-uploads", { defaultValue: "Waiting for images to upload..." }));
            const uploadResult = await uploadTracker.waitForUploads();

            // Show warning if some uploads failed
            if (!uploadResult.allSucceeded && uploadResult.failed > 0) {
              error(
                i18next.t("publish.some-uploads-failed", {
                  defaultValue: `${uploadResult.failed} image(s) failed to upload`,
                  count: uploadResult.failed
                })
              );
            }

            // Show warning if some uploads timed out
            if (uploadResult.timedOut > 0) {
              error(
                i18next.t("publish.uploads-timed-out", {
                  defaultValue: `${uploadResult.timedOut} image upload(s) timed out`,
                  count: uploadResult.timedOut
                })
              );
            }
          }
          if (draft) {
            router.push(`/publish/drafts/${draft._id}`);
          }
        }

        return draft?._id;
      }

      recordActivity();
    },
    onError: (err) => error(...formatError(err))
  });
}

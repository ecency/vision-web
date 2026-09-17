import { addDraft, QueryKeys } from "@ecency/sdk";
import { DraftMetadata, RewardType } from "@/entities";
import { EntryMetadataManagement } from "@/features/entry-management";
import { error, success } from "@/features/shared";
import { postBodySummary } from "@ecency/render-helper";
import { descriptionToPublish } from "../_utils/content";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import i18next from "i18next";
import { usePublishState } from "../_hooks";
import { formatError } from "@/api/format-error";
import { SUBMIT_DESCRIPTION_MAX_LENGTH } from "@/app/submit/_consts";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { ensureValidToken } from "@/utils";

export function useSaveTemplateApi() {
  const { activeUser } = useActiveAccount();

  const queryClient = useQueryClient();

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
    location
  } = usePublishState();

  return useMutation({
    mutationKey: ["saveTemplate"],
    mutationFn: async ({ name }: { name: string }) => {
      if (!activeUser?.username) {
        throw new Error("[Template] No active user");
      }

      const username = activeUser.username;

      const tagJ = tags?.join(" ") ?? "";

      const metaBuilder = await EntryMetadataManagement.EntryMetadataManager.shared
        .builder()
        .default()
        .extractFromBody(content!)
        .withTags(tags)
        // The author's description, unless it is empty or too short to be meaningful
        .withSummary(descriptionToPublish(metaDescription, content!, SUBMIT_DESCRIPTION_MAX_LENGTH))
        .withPostLinks(postLinks)
        .withLocation(location)
        .withSelectedThumbnail(selectedThumbnail);

      const meta = metaBuilder.build();
      const draftMeta: DraftMetadata = {
        ...meta,
        beneficiaries: beneficiaries ?? [],
        rewardType: (reward as RewardType) ?? "default",
        poll,
        postTemplate: true,
        templateName: name
      };

      const token = await ensureValidToken(username);

      const resp = await addDraft(token, title!, content!, tagJ, draftMeta);
      success(i18next.t("post-templates.saved-toast"));

      queryClient.setQueryData(QueryKeys.posts.drafts(username), resp.drafts);
      queryClient.invalidateQueries({ queryKey: QueryKeys.posts.draftsInfinite(username) });
    },
    onError: (err) => error(...formatError(err))
  });
}

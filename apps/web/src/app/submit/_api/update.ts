import { useMutation } from "@tanstack/react-query";
import { formatError } from "@/api/format-error";
import { useCommentMutation } from "@/api/sdk-mutations";
import dayjs from "@/utils/dayjs";
import { EntryBodyManagement, EntryMetadataManagement } from "@/features/entry-management";
import { Entry } from "@/entities";
import { correctIsoDate, makeEntryPath } from "@/utils";
import { error, success } from "@/features/shared";
import i18next from "i18next";
import { useRouter } from "next/navigation";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { useValidatePostUpdating } from "@/api/mutations/validate-post-updating";
import { postBodySummary } from "@ecency/render-helper";
import { EcencyAnalytics } from "@ecency/sdk";
import { useActiveAccount } from "@/core/hooks/use-active-account";

export function useUpdateApi(onClear: () => void) {
  const { username } = useActiveAccount();
  const router = useRouter();

  const { mutateAsync: validatePostUpdating } = useValidatePostUpdating();
  const { updateEntryQueryData } = EcencyEntriesCacheManagement.useUpdateEntry();
  const { mutateAsync: recordActivity } = EcencyAnalytics.useRecordActivity(
    username ?? undefined,
    "legacy-post-updated"
  );
  const { mutateAsync: commentMutation } = useCommentMutation();

  return useMutation({
    mutationKey: ["update"],
    mutationFn: async ({
      title,
      tags,
      body,
      description,
      editingEntry,
      selectedThumbnail
    }: {
      title: string;
      tags: string[];
      body: string;
      description: string | null;
      editingEntry: Entry;
      selectedThumbnail?: string;
    }) => {
      if (!editingEntry) {
        return;
      }

      const { author, permlink, category, json_metadata } = editingEntry;

      if (!username) {
        return;
      }
      const newBody = EntryBodyManagement.EntryBodyManager.shared
        .builder()
        .buildPatchFrom(editingEntry, body);

      const metaBuilder = await EntryMetadataManagement.EntryMetadataManager.shared
        .builder()
        .extend(editingEntry)
        // It should select filled description or if its empty or null/undefined then get auto summary
        .withSummary(description || postBodySummary(body))
        .withTags(tags)
        .withPoll()
        .withSelectedThumbnail(selectedThumbnail);

      const jsonMeta = metaBuilder.build();

      try {
        await commentMutation({
          author: username,
          permlink,
          parentAuthor: "",
          parentPermlink: category,
          title,
          body: newBody,
          jsonMetadata: jsonMeta,
          isUpdate: true
        });

        try {
          await validatePostUpdating({ entry: editingEntry, title, text: newBody });
        } catch (e) {}

        // Update the entry object in store
        const entry: Entry = {
          ...editingEntry,
          title,
          body,
          category: tags[0],
          json_metadata: jsonMeta,
          updated: correctIsoDate(dayjs().toISOString())
        };
        updateEntryQueryData([entry]);

        recordActivity();

        onClear();
        success(i18next.t("submit.updated"));
        const newLoc = makeEntryPath(category, author, permlink);
        router.push(newLoc);
      } catch (e) {
        error(...formatError(e));
      }
    }
  });
}

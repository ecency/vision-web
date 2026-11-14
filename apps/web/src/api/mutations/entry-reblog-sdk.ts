"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BlogEntry, Entry } from "@/entities";
import { error, info, success } from "@/features/shared";
import i18next from "i18next";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { QueryKeys } from "@ecency/sdk";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useReblogMutation } from "@/api/sdk-mutations";
import { scheduleQuestsRefresh } from "@/utils/refresh-quests";

/**
 * Entry-specific reblog mutation hook that wraps SDK reblog with web app cache management.
 *
 * This hook provides:
 * - SDK-based reblog mutation (authentication, broadcasting, recording activity)
 * - Web app-specific cache updates (reblogs count, reblogs list)
 * - User feedback (success/error messages)
 *
 * @param entry - The entry to reblog/unreblog
 * @returns Mutation result with reblog function
 *
 * @example
 * ```typescript
 * const { mutateAsync: reblog, isPending } = useEntryReblog(entry);
 * await reblog({ isDelete: false }); // Reblog
 * await reblog({ isDelete: true });  // Remove reblog
 * ```
 */
export function useEntryReblog(entry: Entry) {
  const { activeUser } = useActiveAccount();
  const { mutateAsync: sdkReblog } = useReblogMutation();
  const { update: updateReblogsCount } = EcencyEntriesCacheManagement.useUpdateReblogsCount(entry);
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["entryReblog", activeUser?.username, entry.author, entry.permlink],
    mutationFn: async ({ isDelete }: { isDelete: boolean }) => {
      // Use SDK reblog mutation
      await sdkReblog({
        author: entry.author,
        permlink: entry.permlink,
        deleteReblog: isDelete,
      });

      return isDelete;
    },
    onSuccess: (isDelete) => {
      // Show user feedback
      isDelete
        ? info(i18next.t("entry-reblog.delete-success"))
        : success(i18next.t("entry-reblog.success"));

      // Update reblogs count in entry cache (clamped to prevent negative values)
      const newReblogsCount = Math.max(0, (entry.reblogs ?? 0) + (isDelete ? -1 : 1));
      updateReblogsCount(newReblogsCount);

      // Reblogging earns points — refresh the ambient quests indicator.
      if (!isDelete) {
        scheduleQuestsRefresh(queryClient, activeUser?.username);
      }

      // Update reblogs list cache (optimistic UI)
      queryClient.setQueryData<BlogEntry[]>(
        QueryKeys.posts.reblogs(activeUser?.username ?? "", 200),
        (data) => {
          if (!data) {
            return data;
          }

          return isDelete
            ? data.filter((d) => d.author !== entry.author || d.permlink !== entry.permlink)
            : [
                {
                  entry_id: 0,
                  blog: activeUser?.username ?? "",
                  post_id: entry.post_id,
                  num: 0,
                  author: entry.author,
                  permlink: entry.permlink,
                  reblogged_on: new Date().toISOString(),
                  created: entry.created,
                },
                ...data,
              ];
        }
      );
    },
    onError: (e) => {
      error(i18next.t("g.server-error"));
      console.error("[EntryReblog]", e);
    },
  });
}

"use client";

import { useMutation } from "@tanstack/react-query";
import * as ss from "@/utils/session-storage";
import { isBlankBody } from "@/utils";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { CommentOptions, Entry, MetaData } from "@/entities";
import { formatError } from "@/api/format-error";
import { error, success } from "@/features/shared";
import { ErrorTypes } from "@/enums";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { updateEntryInCache, restoreEntryInCache } from "@ecency/sdk";
import { useValidatePostUpdating } from "@/api/mutations/validate-post-updating";
import i18next from "i18next";
import { useUpdateReplyMutation } from "@/api/sdk-mutations";

export function useUpdateReply(
  entry?: Entry | null,
  onSuccess?: () => Promise<void>,
  onBlockchainError?: (text: string, error: any) => void,
  root?: Entry | null
) {
  const { activeUser } = useActiveAccount();
  const sdkUpdateReply = useUpdateReplyMutation();

  const { mutateAsync: validatePostUpdating } = useValidatePostUpdating();
  const { updateEntryQueryData } = EcencyEntriesCacheManagement.useUpdateEntry();

  return useMutation({
    mutationKey: ["reply-update", activeUser?.username, entry?.author, entry?.permlink],
    mutationFn: async ({
      text,
      jsonMeta,
      options,
      point,
      title
    }: {
      text: string;
      jsonMeta: MetaData;
      point: boolean;
      options?: CommentOptions;
      /**
       * A comment operation REPLACES the title, and a comment's own title is empty,
       * which is why this defaults to "". A caller that updates a ROOT POST through
       * here (pinning a reply does) must pass the post's title or the broadcast
       * blanks it on chain.
       */
      title?: string;
    }) => {
      if (!activeUser || !entry) {
        throw new Error("[Reply][Update] – no active user provided");
      }
      // Same guard as create-reply: a blank body reaches buildCommentOp and
      // throws its "Missing required parameters" error. Text that only looks
      // blank is worse, because it broadcasts a blank edit for real.
      if (isBlankBody(text)) throw new Error(i18next.t("comment.empty-body"));

      const updatedEntry = {
        ...entry,
        json_metadata: jsonMeta,
        body: text
      };

      // Update cache immediately for instant feedback (web + SDK cache keys)
      updateEntryQueryData([updatedEntry]);
      updateEntryInCache(entry.author, entry.permlink, { body: text, json_metadata: jsonMeta });

      // Fire blockchain broadcast in background using SDK mutation
      const draftKey = `reply_draft_${entry.author}_${entry.permlink}`;

      // Convert web CommentOptions to SDK format
      const sdkOptions = options ? {
        maxAcceptedPayout: options.max_accepted_payout,
        percentHbd: options.percent_hbd,
        allowVotes: options.allow_votes,
        allowCurationRewards: options.allow_curation_rewards,
        beneficiaries: options.extensions?.[0]?.[1]?.beneficiaries
      } : undefined;

      sdkUpdateReply.mutateAsync({
        author: activeUser.username,
        permlink: entry.permlink,
        parentAuthor: entry.parent_author ?? "",
        parentPermlink: entry.parent_permlink ?? entry.category,
        title: title ?? "",
        body: text,
        jsonMetadata: jsonMeta,
        // For discussions cache invalidation, use root post info when available
        rootAuthor: root?.author ?? entry.parent_author,
        rootPermlink: root?.permlink ?? entry.parent_permlink,
        options: sdkOptions
      }).then(async (transactionResult) => {
        // Blockchain confirmed
        try {
          await validatePostUpdating({ entry, text });
          await onSuccess?.();
        } catch (e) {}

        // Only remove draft after blockchain confirms
        ss.remove(draftKey);
        success(i18next.t("g.updated"));
      }).catch((err) => {
        // Blockchain failed - revert to original entry (web + SDK cache keys)
        updateEntryQueryData([entry]);
        restoreEntryInCache(entry.author, entry.permlink, entry as any);

        // Notify parent component to restore text
        if (onBlockchainError) {
          onBlockchainError(text, err);
        }

        // Keep draft for retry
        const [errorMsg, errorType] = formatError(err);

        if (errorType === ErrorTypes.INSUFFICIENT_RESOURCE_CREDITS) {
          error(i18next.t("comment.rc-error-hint"), ErrorTypes.INSUFFICIENT_RESOURCE_CREDITS);
        } else {
          error(errorMsg || i18next.t("comment.retry-hint"), errorType);
        }
      });

      // Return immediately for instant UI feedback
      return updatedEntry;
    },
    onSuccess: async (data) => {
      // Already handled in mutationFn
    },
    onError: (e) => {
      // Revert to original entry if sync error (web + SDK cache keys)
      if (entry) {
        updateEntryQueryData([entry]);
        restoreEntryInCache(entry.author, entry.permlink, entry as any);
      }
      error(...formatError(e));
    }
  });
}

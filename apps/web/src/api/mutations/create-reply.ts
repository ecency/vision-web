// src/api/mutations/create-reply.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatError } from "../format-error";
import { Entry, FullAccount, MetaData, CommentOptions } from "@/entities";
import { isBlankBody, makeCommentOptions, tempEntry } from "@/utils";
import { SortOrder } from "@/enums";
import { error, success } from "@/features/shared";
import { ErrorTypes } from "@/enums";
import { keepFailedReply } from "@/features/shared/comment/failed-decline";
import i18next from "i18next";
import { getAccountRcQueryOptions, addOptimisticDiscussionEntry, removeOptimisticDiscussionEntry } from "@ecency/sdk";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { scheduleQuestsRefresh } from "@/utils/refresh-quests";
import { useCommentMutation } from "@/api/sdk-mutations";
import type { CommentPayload } from "@ecency/sdk";

/**
 * The comment_options a reply broadcasts with: the caller's own, or the publish flow's
 * "Decline payout" options when the reply declines its payout.
 */
function resolveReplyOptions(
  author: string,
  permlink: string,
  options?: CommentOptions,
  declinePayout?: boolean
): CommentOptions | null {
  return options ?? (declinePayout ? makeCommentOptions(author, permlink, "dp") : null);
}

/** Show the reply's payout terms on its optimistic entry before the chain indexes it. */
function applyPayoutTerms(entry: Entry, options: CommentOptions | null) {
  if (options) {
    entry.max_accepted_payout = options.max_accepted_payout;
    entry.percent_hbd = options.percent_hbd;
  }
}

export function useCreateReply(
  entry: Entry,
  root: Entry,
  onSuccess?: () => void,
  /** `submitted` is the account the failed reply was sent from and its payout choice. */
  onBlockchainError?: (
    text: string,
    error: any,
    submitted: { declinePayout: boolean; username: string }
  ) => void
) {
  const { activeUser, account } = useActiveAccount();
  const queryClient = useQueryClient();
  const { updateEntryQueryData } = EcencyEntriesCacheManagement.useUpdateEntry();
  const { addReply } = EcencyEntriesCacheManagement.useAddReply(entry);

  // Get SDK mutation (will be called in fire-and-forget mode)
  const { mutateAsync: sdkComment } = useCommentMutation();

  // Helper to generate discussions cache key (used in 4 places: onMutate, .then(), .catch(), onError)
  // Only handles SortOrder.created for fast-path optimistic updates
  // SDK's predicate-based invalidation handles ALL sort orders via partial key matching
  const getDiscussionsCacheKey = () =>
    [
      "posts",
      "discussions",
      root.author,
      root.permlink,
      SortOrder.created,
      activeUser?.username,
    ] as const;

  return useMutation({
    mutationKey: ["reply-create", activeUser?.username, entry.author, entry.permlink],
    mutationFn: async ({
                         permlink,
                         text,
                         jsonMeta,
                         options,
                         declinePayout,
                         point
                       }: {
      permlink: string;
      text: string;
      jsonMeta: MetaData;
      point: boolean;
      options?: CommentOptions;
      /**
       * Decline the reply's payout. comment_options is create-only, so it goes in the
       * same transaction as the comment, built exactly as the publish flow builds it.
       */
      declinePayout?: boolean;
    }) => {
      if (!activeUser || !account || !entry) throw new Error("Missing active user or entry");
      if (isBlankBody(text)) throw new Error(i18next.t("comment.empty-body"));
      if (!entry.permlink) throw new Error("[Reply][Create] no parent permlink");

      const optimisticEntry = tempEntry({
        author: account,
        permlink,
        parentAuthor: entry.author,
        parentPermlink: entry.permlink,
        title: "",
        body: text,
        tags: [],
        description: null
      });

      const commentOptions = resolveReplyOptions(
        activeUser.username,
        permlink,
        options,
        declinePayout
      );
      applyPayoutTerms(optimisticEntry, commentOptions);

      // Fire blockchain broadcast in background without blocking

      // Build SDK comment payload
      const commentPayload: CommentPayload = {
        author: activeUser.username,
        permlink,
        parentAuthor: entry.author,
        parentPermlink: entry.permlink,
        title: "",
        body: text,
        jsonMetadata: jsonMeta,
        // Pass root post info for discussions cache invalidation (nested replies)
        rootAuthor: root.author,
        rootPermlink: root.permlink,
      };

      // Add options if provided
      if (commentOptions) {
        // Extract beneficiaries defensively from extensions array
        const extractBeneficiaries = (extensions: any[]): Array<{ account: string; weight: number }> => {
          if (!Array.isArray(extensions)) return [];

          for (const ext of extensions) {
            if (Array.isArray(ext) && ext[1]?.beneficiaries) {
              return ext[1].beneficiaries.map((b: any) => ({
                account: b.account,
                weight: b.weight,
              }));
            }
          }
          return [];
        };

        commentPayload.options = {
          maxAcceptedPayout: commentOptions.max_accepted_payout,
          percentHbd: commentOptions.percent_hbd,
          allowVotes: commentOptions.allow_votes,
          allowCurationRewards: commentOptions.allow_curation_rewards,
          beneficiaries: extractBeneficiaries(commentOptions.extensions),
        };
      }

      // Use SDK mutation for blockchain broadcast (fire-and-forget)
      sdkComment(commentPayload)
        .then((transactionResult) => {
          // Blockchain confirmed successfully
          // DO NOT manually update cache here - SDK invalidation will handle it
          // Optimistic entry will be preserved until blockchain indexes the comment

          updateEntryQueryData([optimisticEntry]);

          // Note: SDK handles cache invalidations (RC, discussions, entry)
          // IMPORTANT: We rely on SDK's invalidation which marks queries as stale
          // The discussions query will refetch in background but preserve optimistic entries
          // via custom merge logic in the query options

          success(i18next.t("comment.success"));
          scheduleQuestsRefresh(queryClient, activeUser?.username);
        })
        .catch((err) => {
        // Blockchain failed - remove optimistic entry from web + SDK caches
        queryClient.setQueryData<Entry[]>(
          getDiscussionsCacheKey(),
          (prev) =>
            prev?.filter(
              (r) => !(r.permlink === permlink && r.author === activeUser?.username)
              ) ?? []
        );
        removeOptimisticDiscussionEntry(
          activeUser?.username ?? "", permlink, root.author, root.permlink, queryClient
        );

        // The form cleared its draft on submit: put the text back for this post,
        // with its payout choice, whether or not a box is still there to restore it.
        keepFailedReply(activeUser.username, entry.author, entry.permlink, text, !!declinePayout);

        // Notify parent component to restore text to input
        if (onBlockchainError) {
          onBlockchainError(text, err, {
            declinePayout: !!declinePayout,
            username: activeUser.username
          });
        }

        const [errorMsg, errorType] = formatError(err);

        if (errorType === ErrorTypes.INSUFFICIENT_RESOURCE_CREDITS) {
          error(i18next.t("comment.rc-error-hint"), ErrorTypes.INSUFFICIENT_RESOURCE_CREDITS);
        } else {
          error(errorMsg || i18next.t("comment.retry-hint"), errorType);
        }
      });

      // Return immediately for instant UI feedback
      return optimisticEntry;
    },

    onMutate: async ({ permlink, text, options, declinePayout }) => {
      if (!activeUser || !account) return;

      const optimistic = tempEntry({
        author: account,
        permlink,
        parentAuthor: entry.author,
        parentPermlink: entry.permlink,
        title: "",
        body: text,
        tags: [],
        description: null
      });
      optimistic.is_optimistic = true;
      applyPayoutTerms(
        optimistic,
        resolveReplyOptions(activeUser.username, permlink, options, declinePayout)
      );

      // Add optimistic entry to all discussions caches (all sort orders)
      addOptimisticDiscussionEntry(optimistic, root.author, root.permlink, queryClient);

      return { optimistic, text };
    },

    onSuccess: (realEntry) => {
      // Mutation succeeded (returned temp entry immediately)
      // Actual blockchain confirmation happens in background
      onSuccess?.();
    },

    onError: (err, variables, context) => {
      // Only fires if mutationFn throws synchronously (rare)
      const { optimistic } = context ?? {};

      if (optimistic) {
        queryClient.setQueryData<Entry[]>(
            getDiscussionsCacheKey(),
            (prev) =>
                prev?.filter(
                (r) =>
                  !(r.permlink === optimistic?.permlink && r.author === optimistic?.author)
                ) ?? []
        );
        removeOptimisticDiscussionEntry(
          optimistic.author, optimistic.permlink, root.author, root.permlink, queryClient
        );
      }

      error(...formatError(err));
    }
  });
}

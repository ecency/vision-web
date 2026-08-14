import { validatePostCreating } from "@ecency/sdk";
import { linkThreeSpeakEmbed } from "@/api/threespeak-embed/link-after-broadcast";
import { useCommentMutation, useReblogMutation } from "@/api/sdk-mutations";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { getQueryClient } from "@/core/react-query";
import { getAccountFullQueryOptions, getPostHeaderQueryOptions } from "@ecency/sdk";
import { FullAccount } from "@/entities";
import { PollSnapshot } from "@/features/polls";
import { QueryKeys, type Poll } from "@ecency/sdk";
import { info, success } from "@/features/shared";
import { createPermlink, isCommunity, tempEntry } from "@/utils";
import { scheduleQuestsRefresh } from "@/utils/refresh-quests";
import { EcencyAnalytics } from "@ecency/sdk";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import i18next from "i18next";
import { usePublishState } from "../_hooks";
import { sentry } from "@/core/sentry/lazy-sentry";
import { useActiveAccount } from "@/core/hooks";
import { buildPublishOperation } from "../_utils/build-publish-operation";

export function usePublishApi() {
  const queryClient = useQueryClient();

  const { username, account, isLoading } = useActiveAccount();
  const {
    title,
    content,
    tags,
    metaDescription,
    selectedThumbnail,
    reward,
    beneficiaries,
    isReblogToCommunity,
    poll,
    postLinks,
    location,
    decentMemes,
    aiTools
  } = usePublishState();

  const { updateEntryQueryData } = EcencyEntriesCacheManagement.useUpdateEntry();
  const { mutateAsync: recordActivity } = EcencyAnalytics.useRecordActivity(
    username ?? undefined,
    "post-created"
  );
  const { mutateAsync: commentMutation } = useCommentMutation();
  const { mutateAsync: reblogMutation } = useReblogMutation();

  return useMutation({
    mutationKey: ["publish-2.0"],
    mutationFn: async () => {
      // Ensure user is logged in and account data is available
      if (!username) {
        throw new Error("[Publish] No active user");
      }

      // Wait for account data if still loading
      let authorData: FullAccount;
      if (isLoading) {
        const accountData = await getQueryClient().fetchQuery(getAccountFullQueryOptions(username));
        if (!accountData) {
          throw new Error("[Publish] Failed to load account data");
        }
        authorData = accountData;
      } else if (!account) {
        throw new Error("[Publish] Account data not available");
      } else {
        authorData = account;
      }

      const author = username;

      let permlink = createPermlink(title!);

      // permlink duplication check - ensure uniqueness with retry logic
      // IMPORTANT: Always fetch fresh data (staleTime: 0) to ensure accurate collision detection
      let attempts = 0;
      const maxAttempts = 10;
      while (attempts < maxAttempts) {
        try {
          const existingEntry = await getQueryClient().fetchQuery({
            ...getPostHeaderQueryOptions(author, permlink),
            staleTime: 0 // Force fresh fetch - never use cached data for collision checks
          });

          if (existingEntry?.author) {
            // Permlink collision detected, create new permlink with random suffix
            permlink = createPermlink(title!, true);
            attempts++;
          } else {
            // No collision, permlink is unique
            break;
          }
        } catch (e) {
          // Fetch failed (likely 404), permlink is available
          break;
        }
      }

      if (attempts >= maxAttempts) {
        throw new Error("[Publish] Failed to generate unique permlink after multiple attempts");
      }

      // Same assembly the RC pre-check prices, so the estimate the author saw
      // describes the transaction actually broadcast here.
      const { op, jsonMetadata, summary, options, beneficiariesDropped } = await buildPublishOperation({
        author,
        permlink,
        title: title!,
        content: content!,
        tags: tags!,
        metaDescription,
        selectedThumbnail,
        reward,
        beneficiaries,
        poll,
        postLinks,
        location,
        decentMemes,
        aiTools
      });
      const parentPermlink = op.parent_permlink;
      const cleanBody = op.body;

      if (beneficiariesDropped) {
        info(i18next.t("decentmemes.beneficiaries-trimmed"));
      }

      await commentMutation({
        author,
        permlink,
        parentAuthor: "",
        parentPermlink,
        title: title!,
        body: cleanBody,
        jsonMetadata,
        ...(options
          ? {
              options: {
                maxAcceptedPayout: options.max_accepted_payout,
                percentHbd: options.percent_hbd,
                allowVotes: options.allow_votes,
                allowCurationRewards: options.allow_curation_rewards,
                beneficiaries: options.extensions?.[0]?.[1]?.beneficiaries
              }
            }
          : {})
      });

      // Create an entry object in store and cache
      const entry = {
        ...tempEntry({
          author: authorData!,
          permlink,
          parentAuthor: "",
          parentPermlink,
          title: title!,
          // body: buildBody(body),
          body: content!,

          tags: tags!,
          description: summary,
          jsonMeta: jsonMetadata
        }),
        max_accepted_payout: options?.max_accepted_payout ?? "1000000.000 HBD",
        percent_hbd: options?.percent_hbd ?? 10000
      };
      updateEntryQueryData([entry]);

      try {
        await validatePostCreating(entry.author, entry.permlink, 3);
      } catch (e) {
        sentry.captureException(e, {
          extra: { username: entry.author }
        });
      }

      // Link video to Hive post so it appears in 3Speak feeds (fire-and-forget)
      linkThreeSpeakEmbed(cleanBody, {
        hiveAuthor: author,
        hivePermlink: permlink,
        hiveTitle: title,
        hiveTags: tags
      });

      // Record user activity
      recordActivity().catch(() => {});

      success(i18next.t("submit.published"));
      if (isCommunity(tags?.[0]) && isReblogToCommunity) {
        await reblogMutation({ author, permlink });
      }

      // return [entry as Entry, activePoll] as const;
      return [entry, null as PollSnapshot | null] as const;
    },
    onSuccess([entry, poll]) {
      queryClient.setQueryData<Poll | undefined>(
        QueryKeys.polls.details(entry?.author ?? "", entry?.permlink ?? ""),
        (data) => {
          if (!data) {
            return data;
          }

          return {
            author: entry.author,
            created: new Date().toISOString(),
            end_time: poll?.endTime.toISOString(),
            filter_account_age_days: poll?.filters?.accountAge,
            permlink: entry.permlink,
            poll_choices: Array.isArray(poll?.choices)
                ? poll.choices.map((c, i) => ({
                  choice_num: i,
                  choice_text: c,
                  votes: null
                }))
                : [],
            poll_stats: { total_voting_accounts_num: 0, total_hive_hp_incl_proxied: null },
            poll_trx_id: undefined,
            poll_voters: undefined,
            preferred_interpretation: poll?.interpretation,
            question: poll?.title,
            status: "active",
            tags: [],
            token: null
          } as unknown as Poll;
        }
      );

      scheduleQuestsRefresh(queryClient, username);
    }
  });
}

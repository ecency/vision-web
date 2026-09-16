import { useMutation, useQueryClient } from "@tanstack/react-query";
import { enforceThreeSpeakBeneficiary, linkThreeSpeakEmbed } from "@/api/threespeak-embed";
import { formatError } from "@/api/format-error";
import { useCommentMutation, useReblogMutation } from "@/api/sdk-mutations";
import { useContext } from "react";
import { PollsContext } from "@/app/submit/_hooks/polls-manager";
import { EntryBodyManagement, EntryMetadataManagement } from "@/features/entry-management";
import { QueryKeys, type Poll } from "@ecency/sdk";
import { usePollsCreationManagement } from "@/features/polls";
import { BeneficiaryRoute, Entry, FullAccount, RewardType } from "@/entities";
import { createPermlink, isCommunity, makeCommentOptions, tempEntry } from "@/utils";
import i18next from "i18next";
import { error, success } from "@/features/shared";
import { sentry } from "@/core/sentry/lazy-sentry";
import { useRouter } from "next/navigation";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { postBodySummary } from "@ecency/render-helper";
import { usableDescription } from "@/app/publish/_utils/content";
import { validatePostCreating } from "@ecency/sdk";
import { EcencyAnalytics } from "@ecency/sdk";
import { useActiveAccount } from "@/core/hooks";
import { getQueryClient } from "@/core/react-query";
import { getAccountFullQueryOptions, getPostHeaderQueryOptions } from "@ecency/sdk";

export function usePublishApi(onClear: () => void) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const { username, account, isLoading } = useActiveAccount();
  const { activePoll, clearActivePoll } = useContext(PollsContext);

  const { clearAll } = usePollsCreationManagement();
  const { updateEntryQueryData } = EcencyEntriesCacheManagement.useUpdateEntry();
  const { mutateAsync: recordActivity } = EcencyAnalytics.useRecordActivity(
    username ?? undefined,
    "legacy-post-created"
  );
  const { mutateAsync: commentMutation } = useCommentMutation();
  const { mutateAsync: reblogMutation } = useReblogMutation();

  return useMutation({
    mutationKey: ["publish"],
    mutationFn: async ({
      title,
      tags,
      body,
      description,
      reward,
      reblogSwitch,
      beneficiaries,
      selectedThumbnail
    }: {
      title: string;
      tags: string[];
      body: string;
      description: string | null;
      reward: RewardType;
      reblogSwitch: boolean;
      beneficiaries: BeneficiaryRoute[];
      selectedThumbnail?: string;
    }) => {
      const cbody = EntryBodyManagement.EntryBodyManager.shared.builder().buildClearBody(body);

      // Ensure user is logged in and account data is available
      if (!username) {
        return [];
      }

      // Wait for account data if still loading
      let authorData: FullAccount;
      if (isLoading) {
        const accountData = await getQueryClient().fetchQuery(getAccountFullQueryOptions(username));
        if (!accountData) {
          return [];
        }
        authorData = accountData;
      } else if (!account) {
        return [];
      } else {
        authorData = account;
      }

      const author = username;

      let permlink = createPermlink(title);

      // permlink duplication check - ensure uniqueness with retry logic
      // IMPORTANT: Always fetch fresh data (staleTime: 0) to ensure accurate collision detection
      let attempts = 0;
      const maxAttempts = 10;
      while (attempts < maxAttempts) {
        try {
          const existingEntry = await queryClient.fetchQuery({
            ...getPostHeaderQueryOptions(author, permlink),
            staleTime: 0 // Force fresh fetch - never use cached data for collision checks
          });

          if (existingEntry && existingEntry.author) {
            // Permlink collision detected, create new permlink with random suffix
            permlink = createPermlink(title, true);
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

      const [parentPermlink] = tags;
      const metaBuilder = await EntryMetadataManagement.EntryMetadataManager.shared
        .builder()
        .default()
        .extractFromBody(body)
        // Use the author's description unless it is empty or too short to be meaningful
        .withSummary(usableDescription(description) ?? postBodySummary(body))
        .withTags(tags)
        .withSelectedThumbnail(selectedThumbnail);
      const jsonMeta = metaBuilder
        .withPoll(activePoll)
        .build();

      const finalBeneficiaries = enforceThreeSpeakBeneficiary(beneficiaries, cbody);

      const options = makeCommentOptions(author, permlink, reward, finalBeneficiaries);

      try {
        await commentMutation({
          author,
          permlink,
          parentAuthor: "",
          parentPermlink,
          title,
          body: cbody,
          jsonMetadata: jsonMeta,
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

        // Create entry object in store and cache
        const entry = {
          ...tempEntry({
            author: authorData!,
            permlink,
            parentAuthor: "",
            parentPermlink,
            title,
            body,

            tags,
            description,
            jsonMeta
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
        recordActivity().catch(() => {});

        // Link video to Hive post so it appears in 3Speak feeds (fire-and-forget)
        linkThreeSpeakEmbed(cbody, {
          hiveAuthor: author,
          hivePermlink: permlink,
          hiveTitle: title,
          hiveTags: tags
        });

        success(i18next.t("submit.published"));
        onClear();
        clearActivePoll();
        router.push(`/@${username}/posts`);

        if (isCommunity(tags[0]) && reblogSwitch) {
          await reblogMutation({ author, permlink });
        }

        return [entry as Entry, activePoll] as const;
      } catch (e) {
        error(...formatError(e));
        throw e;
      }
    },
    onSuccess([entry, poll]) {
      clearAll();

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
            poll_choices: poll?.choices.map((c, i) => ({
              choice_num: i,
              choice_text: c,
              votes: null
            })),
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
    }
  });
}

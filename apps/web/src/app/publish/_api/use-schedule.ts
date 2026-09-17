import { addSchedule } from "@ecency/sdk";
import { formatError } from "@/api/format-error";
import { getQueryClient } from "@/core/react-query";
import { getAccountFullQueryOptions, getPostHeaderQueryOptions } from "@ecency/sdk";
import { CommentOptions, Entry, FullAccount, RewardType } from "@/entities";
import { EntryBodyManagement, EntryMetadataManagement } from "@/features/entry-management";
import { error } from "@/features/shared";
import { createPermlink, ensureValidToken, isCommunity, makeCommentOptions } from "@/utils";
import { postBodySummary } from "@ecency/render-helper";
import { descriptionToPublish } from "../_utils/content";
import { useMutation } from "@tanstack/react-query";
import { AxiosError } from "axios";
import i18next from "i18next";
import { usePublishState } from "../_hooks";
import { EcencyAnalytics } from "@ecency/sdk";
import { SUBMIT_DESCRIPTION_MAX_LENGTH } from "@/app/submit/_consts";
import { useActiveAccount } from "@/core/hooks";

export function useScheduleApi() {
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
    aiTools
  } = usePublishState();

  const { mutateAsync: recordActivity } = EcencyAnalytics.useRecordActivity(
    username ?? undefined,
    "post-scheduled"
  );

  return useMutation({
    mutationKey: ["schedule-2.0"],
    mutationFn: async (schedule: Date) => {
      let cleanBody = EntryBodyManagement.EntryBodyManager.shared
        .builder()
        .buildClearBody(content!);

      cleanBody = EntryBodyManagement.EntryBodyManager.shared
        .builder()
        .withLocation(cleanBody, location);

      // Ensure user is logged in and account data is available
      if (!username) {
        throw new Error("[Schedule] No active user");
      }

      // Wait for account data if still loading
      let authorData: FullAccount;
      if (isLoading) {
        const accountData = await getQueryClient().fetchQuery(getAccountFullQueryOptions(username));
        if (!accountData) {
          throw new Error("[Schedule] Failed to load account data");
        }
        authorData = accountData;
      } else if (!account) {
        throw new Error("[Schedule] Account data not available");
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
        throw new Error("[Schedule] Failed to generate unique permlink after multiple attempts");
      }

      const jsonMetaBuilder = await EntryMetadataManagement.EntryMetadataManager.shared
        .builder()
        .default()
        .extractFromBody(cleanBody)
        .withTags(tags)
        // The author's description, unless it is empty or too short to be meaningful
        .withSummary(
          descriptionToPublish(metaDescription, cleanBody, SUBMIT_DESCRIPTION_MAX_LENGTH)
        )
        .withPoll(poll)
        .withPostLinks(postLinks)
        .withLocation(location)
        .withAiTools(aiTools)
        .withSelectedThumbnail(selectedThumbnail);
      const jsonMeta = jsonMetaBuilder.build();
      let options: CommentOptions | null = makeCommentOptions(
        author,
        permlink,
        reward as RewardType,
        beneficiaries
      );
      if (!options) {
        options = {
          allow_curation_rewards: true,
          allow_votes: true,
          author,
          permlink,
          max_accepted_payout: "1000000.000 HBD",
          percent_hbd: 10000,
          extensions: []
        };
      }

      const reblog = Boolean(isCommunity(tags?.[0]) && isReblogToCommunity);

      try {
        const token = await ensureValidToken(author);
        await addSchedule(
          token,
          permlink,
          title!,
          //   buildBody(body),
          cleanBody,
          jsonMeta,
          options,
          schedule.toISOString(),
          reblog
        );
        await recordActivity();
      } catch (e) {
        const [formattedMessage] = formatError(e);
        const message =
          (e instanceof AxiosError && e.response?.data?.message) ||
          formattedMessage ||
          i18next.t("g.server-error");
        error(message);
        // Rethrow so callers can handle failure correctly
        throw e;
      }
    }
  });
}

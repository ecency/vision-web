import { useMutation, useQueryClient } from "@tanstack/react-query";
import { enforceThreeSpeakBeneficiary } from "@/api/threespeak-embed";
import { addSchedule, getPostHeaderQueryOptions } from "@ecency/sdk";
import { useContext } from "react";
import { PollsContext } from "@/app/submit/_hooks/polls-manager";
import { EntryMetadataManagement } from "@/features/entry-management";
import { usePollsCreationManagement } from "@/features/polls";
import { createPermlink, ensureValidToken, isCommunity, makeCommentOptions } from "@/utils";
import { error } from "@/features/shared";
import { AxiosError } from "axios";
import i18next from "i18next";
import { postBodySummary } from "@ecency/render-helper";
import { usableDescription } from "@/app/publish/_utils/content";
import { EcencyAnalytics } from "@ecency/sdk";
import { useActiveAccount } from "@/core/hooks/use-active-account";

export function useScheduleApi(onClear: () => void) {
  const { activeUser } = useActiveAccount();
  const queryClient = useQueryClient();
  const { activePoll, clearActivePoll } = useContext(PollsContext);

  const { clearAll } = usePollsCreationManagement();
  const { mutateAsync: recordActivity } = EcencyAnalytics.useRecordActivity(
    activeUser?.username,
    "legacy-post-scheduled"
  );

  return useMutation({
    mutationKey: ["schedule"],
    mutationFn: async ({
      title,
      tags,
      body,
      reward,
      reblogSwitch,
      beneficiaries,
      schedule,
      description,
      selectedThumbnail
    }: Record<string, any>) => {
      // make sure active user and schedule date has set
      if (!activeUser || !schedule) {
        return;
      }

      let author = activeUser.username;
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
        throw new Error("[Schedule] Failed to generate unique permlink after multiple attempts");
      }

      const jsonMetaBuilder = await EntryMetadataManagement.EntryMetadataManager.shared
        .builder()
        .default()
        .extractFromBody(body)
        .withTags(tags)
        // Use the author's description unless it is empty or too short to be meaningful
        .withSummary(usableDescription(description) ?? postBodySummary(body))
        .withPoll(activePoll)
        .withSelectedThumbnail(selectedThumbnail);
      const jsonMeta = jsonMetaBuilder.build();
      const finalBeneficiaries = enforceThreeSpeakBeneficiary(beneficiaries ?? [], body);

      let options = makeCommentOptions(author, permlink, reward, finalBeneficiaries);
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

      const reblog = isCommunity(tags[0]) && reblogSwitch;

      try {
        const token = await ensureValidToken(author);
        await addSchedule(
          token,
          permlink,
          title,
          body,
          jsonMeta,
          options,
          schedule,
          reblog
        );
        onClear();
        clearActivePoll();
      } catch (e) {
        if (e instanceof AxiosError) {
          if (e.response?.data?.message) {
            error(e.response?.data?.message);
          } else {
            error(i18next.t("g.server-error"));
          }
        }
        // Propagate error so the mutation is rejected
        throw e;
      }
    },
    onSuccess: () => {
      recordActivity();
      clearAll();
    }
  });
}

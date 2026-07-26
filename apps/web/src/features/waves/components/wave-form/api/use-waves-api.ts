import { v4 } from "uuid";
import { useContext } from "react";
import { PollsContext } from "@/features/polls";
import { Entry, FullAccount, WaveEntry } from "@/entities";
import { createReplyPermlink, createWavePermlink, tempEntry } from "@/utils";
import { isEcencyWavesHost } from "@/features/waves/enums/wave-hosts";
import {
  DECENTMEMES_COMMENT_MAX_WEIGHT,
  DECENTMEMES_FRONTEND,
  DecentMemesPayload,
  enforceDecentMemesBeneficiary,
  ensureDecentMemesTag
} from "@/api/decentmemes";
import { EntryMetadataManagement } from "@/features/entry-management";
import { useCommentMutation } from "@/api/sdk-mutations";
import type { CommentPayload } from "@ecency/sdk";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { validatePostCreating } from "@ecency/sdk";
import { getQueryClient } from "@/core/react-query";
import {
  getAccountFullQueryOptions,
  getDiscussionsQueryOptions,
  SortOrder as SDKSortOrder
} from "@ecency/sdk";
import { useActiveAccount } from "@/core/hooks";
import { SortOrder } from "@/enums";
import { enforceThreeSpeakBeneficiary } from "@/api/threespeak-embed/beneficiary";
import { linkThreeSpeakEmbed } from "@/api/threespeak-embed/link-after-broadcast";
import { info } from "@/features/shared";
import i18next from "i18next";

export function useWavesApi() {
  const queryClient = useQueryClient();
  const { username, account, isLoading } = useActiveAccount();

  const { activePoll } = useContext(PollsContext);

  const { updateRepliesCount } = EcencyEntriesCacheManagement.useUpdateRepliesCount();
  const { mutateAsync: sdkComment } = useCommentMutation();

  return useMutation({
    mutationKey: ["wave-threads-api"],
    mutationFn: async ({
      entry,
      raw,
      editingEntry,
      host,
      videoThumbnail,
      decentMemes,
      isReply
    }: {
      entry: Entry;
      raw: string;
      editingEntry?: WaveEntry;
      host?: string;
      videoThumbnail?: string;
      decentMemes?: DecentMemesPayload;
      isReply?: boolean;
    }) => {
      if (!username) {
        throw new Error("[Wave][Thread-base][API] – No active user");
      }

      // Wait for account data if still loading
      let authorData: FullAccount;
      if (isLoading) {
        const accountData = await getQueryClient().fetchQuery(getAccountFullQueryOptions(username));
        if (!accountData) {
          throw new Error("[Wave][Thread-base][API] – Failed to load account data");
        }
        authorData = accountData;
      } else if (!account) {
        throw new Error("[Wave][Thread-base][API] – Account data not available");
      } else {
        authorData = account;
      }

      const parentAuthor = editingEntry?.parent_author ?? entry.author;
      const parentPermlink = editingEntry?.parent_permlink ?? entry.permlink;

      let permlink = editingEntry?.permlink ?? createReplyPermlink(entry.author);

      // Ecency's own waves (ecency.waves and, once live, hive.flow) use the
      // dedicated `wave-*` permlink scheme; other containers use a reply permlink.
      if (isEcencyWavesHost(host) && !editingEntry) {
        permlink = createWavePermlink();
      }
      // DecentMemes applies to new waves on Ecency's own containers
      // (ecency.waves / hive.flow) and to any reply created from the Ecency
      // composer (the parent's container does not change who authored the
      // reply). Third-party new-wave hosts (leothreads / liketu / dbuzz) are
      // excluded.
      const applyDecentMemes =
        !!decentMemes && decentMemes.templateIds.length > 0 && (isReply || isEcencyWavesHost(host));

      const baseTags = raw.match(/\#[a-zA-Z0-9]+/g)?.map((tag) => tag.replace("#", "")) ?? [
        "ecency"
      ];
      const tags = applyDecentMemes ? ensureDecentMemesTag(baseTags) : baseTags;

      const builder = EntryMetadataManagement.EntryMetadataManager.shared
        .builder()
        .default()
        .extractFromBody(raw)
        .withTags(tags)
        .withPoll(activePoll);

      if (videoThumbnail) {
        await builder.withSelectedThumbnail(videoThumbnail);
      }

      if (applyDecentMemes) {
        builder.withDecentMemes({
          templateIds: decentMemes!.templateIds,
          frontend: DECENTMEMES_FRONTEND
        });
      }

      const jsonMeta = builder.build();

      // Build SDK comment payload
      const commentPayload: CommentPayload = {
        author: username,
        permlink,
        parentAuthor,
        parentPermlink,
        title: "",
        body: raw,
        jsonMetadata: jsonMeta,
        rootAuthor: entry.author,
        rootPermlink: entry.permlink
      };

      // Add 3Speak beneficiary when the wave contains a video embed, then merge
      // the DecentMemes meme beneficiaries (comment caps: 30% max) on top.
      let beneficiaries = enforceThreeSpeakBeneficiary([], raw);
      if (applyDecentMemes) {
        const enforced = enforceDecentMemesBeneficiary(
          beneficiaries,
          decentMemes!.beneficiaries,
          username,
          DECENTMEMES_COMMENT_MAX_WEIGHT
        );
        beneficiaries = enforced.beneficiaries;
        if (enforced.dropped) {
          info(i18next.t("decentmemes.beneficiaries-trimmed"));
        }
      }
      if (beneficiaries.length > 0) {
        commentPayload.options = {
          beneficiaries: beneficiaries.map((b) => ({
            account: b.account,
            weight: b.weight
          }))
        };
      }

      await sdkComment(commentPayload);
      if (!editingEntry) {
        // For newly created waves we still confirm blockchain propagation but
        // with shorter retry delays so the UI is not blocked for several
        // seconds when the post appears quickly.
        await validatePostCreating(username, permlink, 0, {
          delays: [750, 1500, 2250]
        });
      }

      // Link video to Hive post so it appears in 3Speak feeds (fire-and-forget)
      linkThreeSpeakEmbed(raw, {
        hiveAuthor: username,
        hivePermlink: permlink,
        hiveTags: tags,
        isEditing: !!editingEntry
      });

      const tempReply = editingEntry
        ? {
            ...editingEntry,
            body: raw
          }
        : tempEntry({
            author: authorData,
            permlink,
            parentAuthor,
            parentPermlink,
            title: "",
            body: raw,
            tags,
            description: null,
            post_id: v4()
          });

      if (!editingEntry) {
        // Inline cache update for discussions list
        // Must resolve the same key the readers subscribe to. They call
        // getDiscussionsQueryOptions(entry) with no observer (see
        // use-wave-discussions-list), so pinning entry.author here would write
        // this optimistic reply into a cache entry nobody is rendering and the
        // reply would not show until the next refetch.
        const options = getDiscussionsQueryOptions(entry, SDKSortOrder.created);
        queryClient.setQueryData<Entry[]>(options.queryKey, (data) => [...(data ?? []), tempReply]);
        updateRepliesCount(entry.children + 1, entry);
      }

      EcencyEntriesCacheManagement.updateEntryQueryData([tempReply], queryClient);

      return tempReply;
    }
  });
}

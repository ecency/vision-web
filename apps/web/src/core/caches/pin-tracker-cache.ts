import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryIdentifiers } from "../react-query";
import { getPostsRankedQueryOptions, QueryKeys } from "@ecency/sdk";
import { useDataLimit } from "@/utils/data-limit";
import { formatError } from "@/api/format-error";
import { usePinPostMutation } from "@/api/sdk-mutations";
import { Community, Entry } from "@/entities";
import { isCommunity } from "@/utils";
import { clone } from "remeda";
import { error, success } from "@/features/shared";
import i18next from "i18next";

/**
 * Whether this post is pinned in its community.
 *
 * The bridge does not report it: `stats.is_pinned` is absent from every
 * get_ranked_posts row and from get_post, so the only way to know is to fetch
 * the community's own "created" page, where the bridge floats pinned posts, and
 * look for this post in it. That is a full 20-post page per call.
 *
 * `canPin` is therefore load-bearing, not a micro-optimisation. Every card in a
 * community feed mounts this menu, so leaving it ungated fetched one such page
 * per distinct community on screen — measured at roughly 1.9 MB gzipped across a
 * desktop trending page, several times the feed itself — to decide whether to
 * offer "Pin" or "Unpin" to a viewer who, in almost every case, can do neither.
 * Pass true only for a viewer who can actually pin here.
 */
export function useCommunityPinCache(entry: Entry, canPin = true) {
  const dataLimit = useDataLimit();
  const { data: rankedPosts } = useQuery({
    ...getPostsRankedQueryOptions(
      "created",
      "",
      "",
      dataLimit,
      entry.category,
      "",
      canPin && isCommunity(entry.category)
    )
  });

  return useQuery({
    queryKey: [QueryIdentifiers.ENTRY_PIN_TRACK, entry.post_id],
    queryFn: async () =>
      rankedPosts?.find(
        (x) =>
          x.author === entry.author && x.permlink === entry.permlink && x.stats?.is_pinned === true
      ) !== undefined,
    initialData: entry.stats?.is_pinned ?? false
  });
}

export function useCommunityPin(entry: Entry, community: Community | null | undefined) {
  const queryClient = useQueryClient();
  const pinPostMutation = usePinPostMutation();

  return useMutation({
    mutationKey: ["PIN_COMMUNITY"],
    mutationFn: (pin: boolean) =>
      pinPostMutation.mutateAsync({
        community: community!.name,
        account: entry.author,
        permlink: entry.permlink,
        pin
      }),
    onError: (e) => error(...formatError(e)),
    onSuccess: (_data, pin) => {
      if (pin) {
        success(i18next.t("entry-menu.pin-success"));
      } else {
        success(i18next.t("entry-menu.unpin-success"));
      }

      queryClient.setQueryData([QueryIdentifiers.ENTRY_PIN_TRACK, entry.post_id], pin);

      queryClient.setQueryData<Entry>(
        QueryKeys.posts.entry(`/@${entry.author}/${entry.permlink}`),
        (data) => {
          if (!data) {
            return data;
          }

          const updatedStats: Entry["stats"] = data.stats
            ? { ...clone(data.stats), is_pinned: pin }
            : data.stats;

          return { ...clone(data), stats: updatedStats };
        }
      );
    }
  });
}

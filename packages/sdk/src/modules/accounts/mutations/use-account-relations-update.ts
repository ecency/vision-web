import { broadcastJson, getQueryClient, QueryKeys } from "@/modules/core";
import type { AuthContext } from "@/modules/core/types";
import { useMutation } from "@tanstack/react-query";
import { getRelationshipBetweenAccountsQueryOptions, getAccountFullQueryOptions } from "../queries";
import { AccountRelationship } from "../types";
import { nextRelation, RelationToggle, syncMutedUsersCache } from "./relation-toggle";

export function useAccountRelationsUpdate(
  reference: string | undefined,
  target: string | undefined,
  auth: AuthContext | undefined,
  onSuccess: (data: Partial<AccountRelationship> | undefined) => void,
  onError: (e: Error) => void
) {
  return useMutation({
    mutationKey: ["accounts", "relation", "update", reference, target],
    mutationFn: async (kind: RelationToggle) => {
      const relationsQuery = getRelationshipBetweenAccountsQueryOptions(
        reference!,
        target!
      );
      await getQueryClient().prefetchQuery(relationsQuery);
      const actualRelation = getQueryClient().getQueryData(
        relationsQuery.queryKey
      );

      await broadcastJson(
        reference,
        "follow",
        [
        "follow",
        {
          follower: reference,
          following: target,
          what: [
            ...(kind === "toggle-ignore" && !actualRelation?.ignores
              ? ["ignore"]
              : []),
            ...(kind === "toggle-follow" && !actualRelation?.follows
              ? ["blog"]
              : []),
          ],
        },
        ],
        auth
      );

      return nextRelation(kind, actualRelation);
    },
    onError,
    onSuccess(data) {
      onSuccess(data);

      getQueryClient().setQueryData(
        QueryKeys.accounts.relations(reference!, target!),
        data
      );

      // Either toggle can change the mute state (see the mutationFn).
      if (reference && target) {
        void syncMutedUsersCache(reference, target, data.ignores === true);
      }

      // Invalidate account query to refetch follow stats (follower_count, following_count)
      // This is needed because profile pages use staleTime: Infinity for performance
      if (target) {
        getQueryClient().invalidateQueries(
          getAccountFullQueryOptions(target)
        );
      }
    },
  });
}

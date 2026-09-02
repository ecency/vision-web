import { getQueryClient, QueryKeys } from "@/modules/core";
import { WrappedResponse } from "@/modules/core/types";
import { InfiniteData, QueryKey, useMutation, UseMutationOptions } from "@tanstack/react-query";
import { AccountFavoriteTag } from "../../types";
import { normalizeTag } from "../../utils/normalize-tag";
import { deleteFavoriteTagRequest } from "./requests";

type InfinitePages = InfiniteData<WrappedResponse<AccountFavoriteTag>>;

interface DeleteContext {
  normalized: string;
  previousList: AccountFavoriteTag[] | undefined;
  previousInfinite: Map<QueryKey, InfinitePages | undefined>;
  /** `undefined` when the check query had no cached value before the mutation. */
  previousCheck: boolean | undefined;
}

/**
 * The mutation options behind useFavoriteTagDelete, exported so the cache
 * behaviour can be exercised without rendering a hook.
 *
 * The tag is removed from the list, the infinite pages and the check entry
 * optimistically. On failure the snapshots are put back for an instant revert, and
 * then every touched key is invalidated anyway: a snapshot taken while another
 * delete was in flight still holds that other tag, so the restore alone would
 * resurrect it. The refetch is what makes the cache converge.
 */
export function favoriteTagDeleteMutationOptions(
  username: string | undefined,
  code: string | undefined,
  onSuccess: () => void,
  onError: (e: Error) => void
): UseMutationOptions<AccountFavoriteTag[], Error, string, DeleteContext | undefined> {
  const invalidateAll = (normalized: string | undefined) => {
    const qc = getQueryClient();
    qc.invalidateQueries({ queryKey: QueryKeys.accounts.favoriteTags(username) });
    qc.invalidateQueries({ queryKey: QueryKeys.accounts.favoriteTagsInfinite(username) });
    if (normalized) {
      qc.invalidateQueries({ queryKey: QueryKeys.accounts.checkFavoriteTag(username!, normalized) });
    }
  };

  return {
    mutationKey: ["accounts", "favorite-tags", "delete", username],
    mutationFn: (tag: string) => deleteFavoriteTagRequest(username, code, tag),
    onMutate: async (tag: string) => {
      const normalized = normalizeTag(tag);
      if (!username || normalized === null) {
        return undefined;
      }

      const qc = getQueryClient();
      const listKey = QueryKeys.accounts.favoriteTags(username);
      const infinitePrefix = QueryKeys.accounts.favoriteTagsInfinite(username);
      const checkKey = QueryKeys.accounts.checkFavoriteTag(username, normalized);

      await Promise.all([
        qc.cancelQueries({ queryKey: listKey }),
        qc.cancelQueries({ queryKey: infinitePrefix }),
        qc.cancelQueries({ queryKey: checkKey }),
      ]);

      const previousList = qc.getQueryData<AccountFavoriteTag[]>(listKey);
      if (previousList) {
        qc.setQueryData<AccountFavoriteTag[]>(
          listKey,
          previousList.filter((f) => f.tag !== normalized)
        );
      }

      const previousCheck = qc.getQueryData<boolean>(checkKey);
      qc.setQueryData<boolean>(checkKey, false);

      const infiniteQueries = qc.getQueriesData<InfinitePages>({ queryKey: infinitePrefix });
      const previousInfinite = new Map(infiniteQueries);
      for (const [key, data] of infiniteQueries) {
        if (data) {
          qc.setQueryData(key, {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              data: page.data.filter((f) => f.tag !== normalized),
            })),
          });
        }
      }

      return { normalized, previousList, previousInfinite, previousCheck };
    },
    onSuccess: (_data, tag) => {
      onSuccess();
      invalidateAll(normalizeTag(tag) ?? undefined);
    },
    onError: (err, _tag, context) => {
      const qc = getQueryClient();
      if (context) {
        if (context.previousList) {
          qc.setQueryData(QueryKeys.accounts.favoriteTags(username), context.previousList);
        }
        for (const [key, data] of context.previousInfinite) {
          qc.setQueryData(key, data);
        }
        const checkKey = QueryKeys.accounts.checkFavoriteTag(username!, context.normalized);
        if (context.previousCheck !== undefined) {
          qc.setQueryData(checkKey, context.previousCheck);
        } else {
          // Nothing was cached before, so the optimistic `false` must not outlive
          // the failure as if it were an answer from the server.
          qc.removeQueries({ queryKey: checkKey, exact: true });
        }
      }
      invalidateAll(context?.normalized);
      onError(err);
    },
  };
}

export function useFavoriteTagDelete(
  username: string | undefined,
  code: string | undefined,
  onSuccess: () => void,
  onError: (e: Error) => void
) {
  return useMutation(favoriteTagDeleteMutationOptions(username, code, onSuccess, onError));
}

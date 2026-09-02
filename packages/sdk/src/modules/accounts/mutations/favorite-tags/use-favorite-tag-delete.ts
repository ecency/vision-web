import { getQueryClient, QueryKeys } from "@/modules/core";
import { WrappedResponse } from "@/modules/core/types";
import { InfiniteData, useMutation } from "@tanstack/react-query";
import { AccountFavoriteTag } from "../../types";
import { normalizeTag } from "../../utils/normalize-tag";
import { deleteFavoriteTagRequest } from "./requests";

export function useFavoriteTagDelete(
  username: string | undefined,
  code: string | undefined,
  onSuccess: () => void,
  onError: (e: Error) => void
) {
  return useMutation({
    mutationKey: ["accounts", "favorite-tags", "delete", username],
    mutationFn: (tag: string) => deleteFavoriteTagRequest(username, code, tag),
    onMutate: async (tag: string) => {
      const normalized = normalizeTag(tag);
      if (!username || normalized === null) {
        return;
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

      const infiniteQueries = qc.getQueriesData<InfiniteData<WrappedResponse<AccountFavoriteTag>>>({
        queryKey: infinitePrefix,
      });
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

      return { previousList, previousInfinite, previousCheck, normalized };
    },
    onSuccess: (_data, tag) => {
      onSuccess();
      const qc = getQueryClient();
      qc.invalidateQueries({ queryKey: QueryKeys.accounts.favoriteTags(username) });
      qc.invalidateQueries({ queryKey: QueryKeys.accounts.favoriteTagsInfinite(username) });
      qc.invalidateQueries({
        queryKey: QueryKeys.accounts.checkFavoriteTag(username!, normalizeTag(tag) ?? tag),
      });
    },
    onError: (err, _tag, context) => {
      const qc = getQueryClient();
      if (context?.previousList) {
        qc.setQueryData(QueryKeys.accounts.favoriteTags(username), context.previousList);
      }
      if (context?.previousInfinite) {
        for (const [key, data] of context.previousInfinite) {
          qc.setQueryData(key, data);
        }
      }
      if (context?.previousCheck !== undefined && context.normalized) {
        qc.setQueryData(
          QueryKeys.accounts.checkFavoriteTag(username!, context.normalized),
          context.previousCheck
        );
      }
      onError(err);
    },
  });
}

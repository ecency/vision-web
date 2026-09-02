import { getQueryClient, QueryKeys } from "@/modules/core";
import { useMutation } from "@tanstack/react-query";
import { normalizeTag } from "../../utils/normalize-tag";
import { addFavoriteTagRequest } from "./requests";

export function useFavoriteTagAdd(
  username: string | undefined,
  code: string | undefined,
  onSuccess: () => void,
  onError: (e: Error) => void
) {
  return useMutation({
    mutationKey: ["accounts", "favorite-tags", "add", username],
    mutationFn: (tag: string) => addFavoriteTagRequest(username, code, tag),
    onSuccess: (_data, tag) => {
      onSuccess();
      const qc = getQueryClient();
      qc.invalidateQueries({ queryKey: QueryKeys.accounts.favoriteTags(username) });
      qc.invalidateQueries({ queryKey: QueryKeys.accounts.favoriteTagsInfinite(username) });
      qc.invalidateQueries({
        queryKey: QueryKeys.accounts.checkFavoriteTag(username!, normalizeTag(tag) ?? tag),
      });
    },
    onError,
  });
}

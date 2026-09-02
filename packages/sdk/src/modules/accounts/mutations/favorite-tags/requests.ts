import { CONFIG, getBoundFetch } from "@/modules/core";
import { AccountFavoriteTag } from "../../types";
import { normalizeTag } from "../../utils/normalize-tag";

async function favoriteTagRequest(
  route: "favorite-tags-add" | "favorite-tags-delete",
  username: string | undefined,
  code: string | undefined,
  tag: string
): Promise<AccountFavoriteTag[]> {
  if (!username || !code) {
    throw new Error("[SDK][Accounts][FavoriteTags] – missing auth");
  }
  // Normalised before it leaves the client, so the request, the cache key and the
  // stored row all agree on the spelling.
  const normalized = normalizeTag(tag);
  if (normalized === null) {
    throw new Error("[SDK][Accounts][FavoriteTags] – invalid tag");
  }

  const fetchApi = getBoundFetch();
  const response = await fetchApi(CONFIG.privateApiHost + "/private-api/" + route, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tag: normalized,
      code,
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to ${route === "favorite-tags-add" ? "add" : "delete"} favorite tag: ${response.status}`);
  }
  return (await response.json()) as AccountFavoriteTag[];
}

/** Follow a hashtag. Resolves to the updated list, newest first. */
export function addFavoriteTagRequest(
  username: string | undefined,
  code: string | undefined,
  tag: string
): Promise<AccountFavoriteTag[]> {
  return favoriteTagRequest("favorite-tags-add", username, code, tag);
}

/** Unfollow a hashtag. Resolves to the updated list, newest first. */
export function deleteFavoriteTagRequest(
  username: string | undefined,
  code: string | undefined,
  tag: string
): Promise<AccountFavoriteTag[]> {
  return favoriteTagRequest("favorite-tags-delete", username, code, tag);
}

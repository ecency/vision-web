import { getQueryClient, QueryKeys } from "@/modules/core";
import { AccountRelationship } from "../types";

export type RelationToggle = "toggle-ignore" | "toggle-follow";

/**
 * The relation after a toggle. Hive keeps one follow state per pair (blog,
 * ignore or none), so following someone who is muted also unmutes them, and
 * muting someone also unfollows them.
 */
export function nextRelation(
  kind: RelationToggle,
  actual: Partial<AccountRelationship> | undefined
): Partial<AccountRelationship> {
  const following = kind === "toggle-follow" && !actual?.follows;
  const muting = kind === "toggle-ignore" && !actual?.ignores;
  return {
    ...actual,
    ignores: kind === "toggle-ignore" ? muting : following ? false : actual?.ignores,
    follows: kind === "toggle-follow" ? following : muting ? false : actual?.follows,
  };
}

/**
 * Applies a mute change to the viewer's cached mute list. Lists hide muted
 * authors straight from this cache, so it has to follow the toggle rather than
 * wait to go stale: otherwise an unmuted author stays hidden until a reload.
 *
 * A fetch of the list still in flight started before the toggle and would land
 * the old list on top of this change, so it is cancelled first. When there was
 * no list yet to patch (that cancelled fetch was its first), any screen showing
 * it fetches it again, and the toggle is applied on top of the result too: a
 * node that has not indexed the new operation yet still returns the old list.
 * A list nobody has fetched is left alone; its first fetch is current.
 */
export async function syncMutedUsersCache(
  reference: string,
  target: string,
  ignores: boolean
): Promise<void> {
  const client = getQueryClient();
  const queryKey = QueryKeys.accounts.mutedUsers(reference);

  await client.cancelQueries({ queryKey, exact: true });

  if (client.getQueryData<string[]>(queryKey) === undefined) {
    await client.invalidateQueries({ queryKey, exact: true });
  }

  client.setQueryData<string[]>(queryKey, (list) => {
    if (!list) return list;
    const rest = list.filter((name) => name !== target);
    return ignores ? [...rest, target] : rest;
  });
}

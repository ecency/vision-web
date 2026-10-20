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
 * A list that was never fetched is left alone; its first fetch is current.
 */
export function syncMutedUsersCache(reference: string, target: string, ignores: boolean) {
  getQueryClient().setQueryData<string[]>(QueryKeys.accounts.mutedUsers(reference), (list) => {
    if (!list) return list;
    const rest = list.filter((name) => name !== target);
    return ignores ? [...rest, target] : rest;
  });
}

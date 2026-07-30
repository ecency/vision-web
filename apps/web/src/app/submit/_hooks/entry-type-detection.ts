import { useMemo } from "react";
import { useActiveAccount } from "@/core/hooks/use-active-account";

/**
 * Which submit route we are on, resolved synchronously.
 *
 * Both flags used to live in state and be filled from an effect, so every
 * consumer saw `false`/`false` for the first commit. `useMount` callers - the
 * local draft restore in particular - read them in that same commit, so the
 * "don't restore the local draft over a draft/entry" guard never actually held
 * and a stale local draft was pushed into the editor on /draft/[id] and
 * /@author/permlink/edit alike. Both values are pure functions of the
 * arguments and the active user, so derive them during render instead.
 */
export function useEntryTypeDetection(
  path: string,
  username: string | undefined,
  permlink: string | undefined,
  draftId: string | undefined
) {
  const { activeUser } = useActiveAccount();

  const isEntry = useMemo(
    () => !!(activeUser && path.endsWith("/edit") && username && permlink),
    [activeUser, path, permlink, username]
  );

  const isDraft = useMemo(
    () => !!(activeUser && path.startsWith("/draft") && draftId),
    [activeUser, draftId, path]
  );

  return { isEntry, isDraft };
}

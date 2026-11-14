import useInterval from "react-use/lib/useInterval";
import { getPostQueryOptions } from "@ecency/sdk";
import { Entry } from "@/entities";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useQueryClient } from "@tanstack/react-query";
import { isLocalEntry } from "./is-local-entry";

export function useEntryChecking(
  initialEntry: Entry | undefined,
  intervalStarted: boolean,
  onSuccessCheck: (entry: Entry) => void,
  customCondition?: (e1: Entry, e2: Entry | null) => boolean
) {
  const { activeUser } = useActiveAccount();
  const queryClient = useQueryClient();

  return useInterval(
    async () => {
      // Checking for transaction status
      if (initialEntry) {
        try {
          const entry = await queryClient.fetchQuery(
            getPostQueryOptions(activeUser!.username, initialEntry.permlink)
          );
          const isAlreadyAdded =
            initialEntry.permlink === entry?.permlink && !isLocalEntry(initialEntry);
          const isCustomCondition = customCondition?.(initialEntry, entry ?? null) ?? true;
          if (entry && (!isAlreadyAdded || isCustomCondition)) {
            onSuccessCheck(entry);
          }
        } catch (e) {}
      }
    },
    intervalStarted ? 3000 : null
  );
}

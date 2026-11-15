import { useBroadcastMutation, invalidateAfterBroadcast, QueryKeys } from "@/modules/core";
import type { BroadcastMode } from "@/modules/core";
import { buildDelegateRcOp } from "@/modules/operations/builders";
import { parseDelegateRcDelegatees } from "@/modules/operations/builders/wallet";
import type { AuthContextV2 } from "@/modules/core/types";

export interface DelegateRcPayload {
  to: string;
  maxRc: string | number;
}

export function useDelegateRc(
  username: string | undefined,
  auth?: AuthContextV2,
  broadcastMode?: BroadcastMode
) {
  return useBroadcastMutation<DelegateRcPayload>(
    ["wallet", "delegate-rc"],
    username,
    ({ to, maxRc }) => [
      buildDelegateRcOp(username!, to, maxRc)
    ],
    async (_result, variables) => {
      // `to` may be a comma separated list: refresh each delegatee.
      const accounts = [username!, ...parseDelegateRcDelegatees(variables.to)];
      await invalidateAfterBroadcast(
        auth?.adapter,
        broadcastMode,
        accounts.flatMap((account) => [
          QueryKeys.accounts.full(account),
          QueryKeys.resourceCredits.account(account),
        ])
      );
    },
    auth,
    'posting',
    { broadcastMode }
  );
}

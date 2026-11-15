import { useBroadcastMutation, invalidateAfterBroadcast, QueryKeys } from "@/modules/core";
import type { BroadcastMode } from "@/modules/core";
import { buildDelegateRcOp } from "@/modules/operations/builders";
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
      await invalidateAfterBroadcast(auth?.adapter, broadcastMode, [
        QueryKeys.accounts.full(username),
        QueryKeys.accounts.full(variables.to),
        QueryKeys.resourceCredits.account(username!),
        QueryKeys.resourceCredits.account(variables.to),
      ]);
    },
    auth,
    'posting',
    { broadcastMode }
  );
}

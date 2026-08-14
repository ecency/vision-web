"use client";

import { useQuery } from "@tanstack/react-query";
import {
  estimateRcPrecheck,
  getAccountRcQueryOptions,
  getRcResourceParamsQueryOptions,
  getRcStatsQueryOptions,
  type RcPrecheckOperation,
  type RcPrecheckPayload,
  type RcPrecheckResult
} from "@ecency/sdk";

/**
 * Client-side Resource Credits pre-check for the editor surfaces.
 *
 * Pass `payload` whenever the caller knows what it is about to broadcast. RC
 * cost is dominated by the serialized transaction size, so the draft itself is
 * what makes the answer correct: the same account can comfortably afford a
 * reply and be unable to afford a long post. Without a payload a minimal
 * operation is priced, which is a lower bound rather than a guess.
 *
 * Reuses the queries the AvailableCredits widget already loads, plus the
 * resource params, which are cached for the session.
 */
export function useRcPrecheck(
  username: string | undefined,
  operation: RcPrecheckOperation,
  payload?: RcPrecheckPayload,
  buffer?: number
): RcPrecheckResult {
  const { data: rcAccounts } = useQuery(getAccountRcQueryOptions(username ?? ""));
  const { data: rcStats } = useQuery(getRcStatsQueryOptions());
  const { data: rcParams } = useQuery(getRcResourceParamsQueryOptions());

  return estimateRcPrecheck({
    rcAccount: rcAccounts?.[0],
    rcStats,
    rcParams,
    operation,
    payload,
    buffer
  });
}

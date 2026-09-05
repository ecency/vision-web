"use client";

import { useCurationRecommend } from "@ecency/sdk";
import { getWebBroadcastAdapter } from "@/providers/sdk";
import { useActiveUsername } from "@/core/hooks/use-active-username";

/**
 * Web wrapper over the SDK's useCurationRecommend broadcast hook: active user
 * from the global store, the shared web broadcast adapter for auth. The meta
 * ping and the optimistic row state live in the curation-desk feature
 * (curation-recommend-flow.ts), because the broadcast result is not uniform
 * across auth paths and two of them never resolve at all.
 */
export function useCurationRecommendMutation() {
  const username = useActiveUsername();
  const adapter = getWebBroadcastAdapter();
  return useCurationRecommend(username, { adapter });
}

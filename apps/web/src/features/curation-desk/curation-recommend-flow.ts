"use client";

import { useCallback } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  QueryKeys,
  getCurationPostQueryOptions,
  normalizeBroadcastTrxId,
  type CurationPost,
  type CurationReason,
} from "@ecency/sdk";
import { useActiveUsername } from "@/core/hooks/use-active-username";
import { useCurationRecommendMutation } from "@/api/sdk-mutations/use-curation-recommend-mutation";
import { META_RETRY_MS, RECOMMEND_CONFIRM_DEADLINE_MS, RECOMMEND_POLL_AT_S } from "./consts";
import { curationDeskApi } from "./curation-desk-api";
import {
  getRecommendState,
  recommendKey,
  setRecommendState,
  useRecommendState,
} from "./curation-recommend-store";

/**
 * Recommend flow, web side.
 *
 * 1. The row flips optimistically when the broadcast is sent and keeps a
 *    "recommended" state on success; it never reverts to "Recommend" on its
 *    own (a second broadcast spends RC and adds a chain row for nothing).
 * 2. Route 5 is memoized 15 s at the gateway, so fixed polls could miss; the
 *    row polls at 5, 15, 30 and 60 s until the viewer's name shows up in
 *    `recommenders`, then shows "sent, confirming" with Withdraw.
 * 3. The meta ping is sent when the broadcast resolves (with the normalised
 *    trx_id when a path returned one) AND from the first confirming poll when
 *    no meta is set yet; either way it retries with backoff and a final
 *    failure only means the row counts in the no-meta bucket.
 */

const timers = new Map<string, ReturnType<typeof setTimeout>[]>();
const pinged = new Set<string>();

function clearTimers(key: string) {
  for (const t of timers.get(key) ?? []) clearTimeout(t);
  timers.delete(key);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Idempotent server side, so retries are free. Never throws. */
export async function pingRecommendMeta(
  username: string | undefined,
  author: string,
  permlink: string,
  trxId: string | null
): Promise<boolean> {
  const key = recommendKey(author, permlink);
  if (!username || pinged.has(key)) return pinged.has(key);
  for (let attempt = 0; attempt <= META_RETRY_MS.length; attempt++) {
    try {
      await curationDeskApi.recommendMeta(username, { author, permlink, trx_id: trxId ?? undefined });
      pinged.add(key);
      return true;
    } catch {
      if (attempt < META_RETRY_MS.length) await sleep(META_RETRY_MS[attempt]);
    }
  }
  return false;
}

function viewerRow(post: CurationPost | undefined, username: string) {
  return post?.recommenders?.find((r) => r.username === username);
}

/**
 * Poll route 5 with backoff after a broadcast. `withdraw` waits for the name
 * to disappear instead of appearing.
 */
export function startRecommendPoll(
  queryClient: QueryClient,
  username: string,
  author: string,
  permlink: string,
  withdraw: boolean
) {
  const key = recommendKey(author, permlink);
  clearTimers(key);
  const startedAt = Date.now();
  const handles: ReturnType<typeof setTimeout>[] = [];

  const finish = (confirmed: boolean) => {
    clearTimers(key);
    const current = getRecommendState(author, permlink);
    if (confirmed) {
      setRecommendState(author, permlink, withdraw ? { phase: "withdrawn" } : { phase: "recommended", confirmed: true });
      queryClient.invalidateQueries({ queryKey: QueryKeys.curation._recommendationsPrefix });
    } else if (current.phase === "pending" || (current.phase === "recommended" && !current.confirmed)) {
      setRecommendState(author, permlink, { phase: "confirming", withdraw });
    }
  };

  const check = async (last: boolean) => {
    const current = getRecommendState(author, permlink);
    if (current.phase === "idle" || current.phase === "withdrawn" || (current.phase === "recommended" && current.confirmed)) {
      clearTimers(key);
      return;
    }
    let post: CurationPost | undefined;
    try {
      post = await queryClient.fetchQuery({ ...getCurationPostQueryOptions(author, permlink), staleTime: 0 });
    } catch {
      post = undefined;
    }
    const mine = viewerRow(post, username);
    const seen = withdraw ? post !== undefined && !mine : !!mine;
    if (seen) {
      finish(true);
      if (!withdraw && mine && !mine.has_meta) {
        const trxId = current.phase === "pending" ? current.trxId : null;
        void pingRecommendMeta(username, author, permlink, trxId);
      }
      return;
    }
    if (last || Date.now() - startedAt >= RECOMMEND_CONFIRM_DEADLINE_MS) {
      finish(false);
    }
  };

  RECOMMEND_POLL_AT_S.forEach((seconds, index) => {
    handles.push(setTimeout(() => void check(index === RECOMMEND_POLL_AT_S.length - 1), seconds * 1000));
  });
  timers.set(key, handles);
}

export function useRecommendFlow(author: string, permlink: string) {
  const username = useActiveUsername();
  const queryClient = useQueryClient();
  const mutation = useCurationRecommendMutation();
  const state = useRecommendState(author, permlink);

  const run = useCallback(
    async (withdraw: boolean, reason?: CurationReason) => {
      if (!username) throw new Error("[CurationDesk] recommend needs a logged in user");
      const previous = getRecommendState(author, permlink);
      setRecommendState(author, permlink, {
        phase: "pending",
        since: Date.now(),
        withdraw,
        trxId: null,
        pinged: false,
      });
      // The poll starts now, not on success: the HiveSigner redirect and the
      // Keychain Mobile deep link never resolve this promise.
      startRecommendPoll(queryClient, username, author, permlink, withdraw);
      try {
        const result = await mutation.mutateAsync({ author, permlink, reason, withdraw });
        const trxId = normalizeBroadcastTrxId(result);
        const current = getRecommendState(author, permlink);
        if (current.phase === "pending") {
          setRecommendState(author, permlink, { ...current, trxId });
        }
        if (!withdraw) {
          setRecommendState(author, permlink, { phase: "recommended", confirmed: false });
          void pingRecommendMeta(username, author, permlink, trxId);
        }
        return result;
      } catch (error) {
        clearTimers(recommendKey(author, permlink));
        setRecommendState(author, permlink, previous);
        throw error;
      }
    },
    [author, permlink, username, queryClient, mutation]
  );

  const recommend = useCallback((reason: CurationReason) => run(false, reason), [run]);
  const withdraw = useCallback(() => run(true), [run]);

  return { state, recommend, withdraw, isPending: mutation.isPending, username };
}

/** Test-only. */
export function resetRecommendFlowForTests() {
  for (const key of timers.keys()) clearTimers(key);
  pinged.clear();
}

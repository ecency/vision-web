"use client";

import { useCallback, useEffect } from "react";
import i18next from "i18next";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  QueryKeys,
  getCurationPostQueryOptions,
  normalizeBroadcastTrxId,
  type CurationPost,
  type CurationReason,
} from "@ecency/sdk";
import type { InfiniteData } from "@tanstack/react-query";
import type { DeskRow } from "./types";
import { useActiveUsername } from "@/core/hooks/use-active-username";
import { useCurationRecommendMutation } from "@/api/sdk-mutations/use-curation-recommend-mutation";
import { META_RETRY_MS, RECOMMEND_CONFIRM_DEADLINE_MS, RECOMMEND_POLL_AT_S } from "./consts";
import { curationDeskApi } from "./curation-desk-api";
import { feedServesRecommendationsOnly, type FeedFilters } from "./curation-feed-rules";
import { refreshCurationStatus } from "./curation-status-refresh";
import {
  clearRecommendStates,
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
/** Meta pings already accepted, keyed by viewer and post like the store. */
const pinged = new Set<string>();
/**
 * Withdrawals in flight, keyed like the store. A signer can hold the promise
 * open for a long time, and the button instance that started it may by then
 * show another post (the quick view keeps one mounted button across rows), so
 * the guard belongs to the recommendation, not to the component.
 */
const withdrawing = new Set<string>();

function clearTimers(key: string) {
  for (const t of timers.get(key) ?? []) clearTimeout(t);
  timers.delete(key);
}

const NO_USER = Symbol("no user");
let activeUser: string | undefined | typeof NO_USER = NO_USER;

/**
 * An account switch drops every optimistic state, timer and ping of the
 * account that left: they answer "did YOU recommend this", to which the new
 * viewer has their own answer.
 */
function onViewerChanged(username: string | undefined) {
  if (activeUser === username) return;
  const first = activeUser === NO_USER;
  activeUser = username;
  if (first) return;
  for (const key of Array.from(timers.keys())) clearTimers(key);
  pinged.clear();
  withdrawing.clear();
  clearRecommendStates();
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
  const key = recommendKey(username, author, permlink);
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

/**
 * Route 5 confirmed the change: copy its counts onto every loaded feed row of
 * that post so the badge updates without refetching a page.
 */
/**
 * A recommendation made or withdrawn changes which posts the recommendation
 * feeds hold: the public list, and every roster feed that serves active
 * recommendations only, the curators' recommendations tab among them. Other
 * roster feeds keep their pages; their counts are patched in place.
 */
export function invalidateRecommendationFeeds(queryClient: QueryClient, username: string | undefined) {
  refreshCurationStatus(queryClient);
  queryClient.invalidateQueries({ queryKey: QueryKeys.curation._recommendationsPrefix });
  queryClient.invalidateQueries({
    queryKey: QueryKeys.curation.rosterFeed(username).slice(0, 3),
    predicate: (query) => feedServesRecommendationsOnly((query.queryKey[3] ?? {}) as FeedFilters),
  });
}

export function patchRecommendCounts(queryClient: QueryClient, post: CurationPost) {
  queryClient.setQueriesData<InfiniteData<{ items: DeskRow[] }, unknown>>(
    { queryKey: QueryKeys.curation._prefix },
    (old) => {
      if (!old || !Array.isArray(old.pages)) return old;
      let changed = false;
      const pages = old.pages.map((page) => {
        if (!Array.isArray(page?.items)) return page;
        const index = page.items.findIndex((r) => r.author === post.author && r.permlink === post.permlink);
        if (index === -1) return page;
        const row = page.items[index];
        if (
          row.recommend_count === post.recommend_count &&
          row.unique_recommenders === post.unique_recommenders &&
          row.reco_no_meta_count === post.reco_no_meta_count
        ) {
          return page;
        }
        changed = true;
        const items = page.items.slice();
        items[index] = {
          ...row,
          recommend_count: post.recommend_count,
          unique_recommenders: post.unique_recommenders,
          reco_no_meta_count: post.reco_no_meta_count,
        };
        return { ...page, items };
      });
      return changed ? { ...old, pages } : old;
    }
  );
}

function viewerRow(post: CurationPost | undefined, username: string) {
  return post?.recommenders?.find((r) => r.username === username);
}

/**
 * Poll route 5 with backoff after a broadcast. `withdraw` waits for the name
 * to disappear instead of appearing, but only from a body that once carried
 * it: route 5 is memoized, so an answer built before the recommendation was
 * indexed is missing the name for a reason that has nothing to do with the
 * withdrawal. Nothing else is proof. A recommend_count that fell is a fact
 * about the post, not about this viewer: another recommender withdrawing
 * between two polls moves it just as well, and reading that as "withdrawn"
 * would send the next click to broadcast a duplicate recommendation.
 *
 * `viewerListed` carries that proof in from before the poll: a poll of this
 * session that confirmed the recommendation, or a route 5 body in the query
 * cache that lists the name. Without it a withdrawal indexed before the first
 * poll would never confirm, since every answer from then on is missing the
 * name.
 */
export function startRecommendPoll(
  queryClient: QueryClient,
  username: string,
  author: string,
  permlink: string,
  withdraw: boolean,
  viewerListed = false
) {
  const key = recommendKey(username, author, permlink);
  clearTimers(key);
  const startedAt = Date.now();
  const handles: ReturnType<typeof setTimeout>[] = [];
  /** The viewer's recommendation was listed by at least one answer. */
  let sawViewer = viewerListed;

  const finish = (confirmed: boolean) => {
    clearTimers(key);
    const current = getRecommendState(username, author, permlink);
    if (confirmed) {
      setRecommendState(
        username,
        author,
        permlink,
        withdraw ? { phase: "withdrawn" } : { phase: "recommended", confirmed: true }
      );
      // A confirmed withdraw removed the chain row, so a later recommendation
      // of the same post needs its meta ping to travel again.
      if (withdraw) pinged.delete(key);
      invalidateRecommendationFeeds(queryClient, username);
    } else if (current.phase === "pending" || (current.phase === "recommended" && !current.confirmed)) {
      setRecommendState(username, author, permlink, { phase: "confirming", withdraw });
    }
  };

  const check = async (last: boolean) => {
    const current = getRecommendState(username, author, permlink);
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
    if (post && mine) sawViewer = true;
    const seen = withdraw ? post !== undefined && !mine && sawViewer : !!mine;
    if (seen) {
      finish(true);
      if (post) patchRecommendCounts(queryClient, post);
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
  const state = useRecommendState(username, author, permlink);

  useEffect(() => onViewerChanged(username), [username]);

  const run = useCallback(
    async (withdraw: boolean, reason?: CurationReason) => {
      if (!username) throw new Error(i18next.t("curation-desk.recommend.needs-login"));
      const previous = getRecommendState(username, author, permlink);
      // `since` doubles as this run's token. The poll and a later click both
      // write over the pending record, so only the run that installed it may
      // take it back.
      const since = Date.now();
      setRecommendState(username, author, permlink, {
        phase: "pending",
        since,
        withdraw,
        trxId: null,
        pinged: false,
      });
      // A withdrawal is confirmed by the name disappearing from a body that
      // once carried it. What already carried it counts: a poll of this
      // session that confirmed the recommendation, or the route 5 body the
      // quick view fetched.
      const listed =
        withdraw &&
        ((previous.phase === "recommended" && previous.confirmed) ||
          !!viewerRow(queryClient.getQueryData(getCurationPostQueryOptions(author, permlink).queryKey), username));
      // The poll starts now, not on success: the HiveSigner redirect and the
      // Keychain Mobile deep link never resolve this promise.
      startRecommendPoll(queryClient, username, author, permlink, withdraw, listed);
      try {
        const result = await mutation.mutateAsync({ author, permlink, reason, withdraw });
        const trxId = normalizeBroadcastTrxId(result);
        const current = getRecommendState(username, author, permlink);
        // The poll runs while the broadcast is pending, so by now it may have
        // confirmed the recommendation or landed on a state of its own. A
        // resolved broadcast only advances the state it started: writing
        // "recommended, unconfirmed" over either of those loses what the chain
        // already told us.
        if (current.phase === "pending") {
          setRecommendState(
            username,
            author,
            permlink,
            withdraw ? { ...current, trxId } : { phase: "recommended", confirmed: false }
          );
        }
        if (!withdraw) {
          void pingRecommendMeta(username, author, permlink, trxId);
        }
        return result;
      } catch (error) {
        const current = getRecommendState(username, author, permlink);
        // A rejection only undoes the pending record this run installed. The
        // poll reads the chain while the broadcast is unresolved and a signer
        // can reject long after the operation landed, so restoring `previous`
        // over a confirmed state would send the next click to broadcast a
        // duplicate. The caller still shows the error either way.
        if (current.phase === "pending" && current.since === since) {
          clearTimers(recommendKey(username, author, permlink));
          setRecommendState(username, author, permlink, previous);
        }
        throw error;
      }
    },
    [author, permlink, username, queryClient, mutation]
  );

  const recommend = useCallback((reason: CurationReason) => run(false, reason), [run]);

  // One withdrawal per recommendation. The button is disabled while a
  // withdrawal is in flight, but the keyboard binding and the entry menu reach
  // this without asking the button, and a second `unrecommend` spends RC for a
  // row the chain no longer has. Resolves true when this call withdrew the
  // recommendation (broadcast, or found it already gone) and false when it did
  // nothing, so the caller reports only what happened.
  const withdraw = useCallback(async (): Promise<boolean> => {
    const key = recommendKey(username, author, permlink);
    if (withdrawing.has(key)) return false;
    const current = username ? getRecommendState(username, author, permlink) : undefined;
    if (current && (current.phase === "withdrawn" || (current.phase === "pending" && current.withdraw))) {
      return false;
    }
    withdrawing.add(key);
    try {
      if (username && current?.phase === "confirming" && current.withdraw) {
        // A withdrawal went out and its poll ended without proof either way.
        // That is a minute past the broadcast, beyond any memo built before
        // the recommendation, so one fresh answer settles it: the name gone is
        // the withdrawal; the name still there is a row the chain still has,
        // and a second withdrawal is the right call.
        let post: CurationPost | undefined;
        try {
          post = await queryClient.fetchQuery({ ...getCurationPostQueryOptions(author, permlink), staleTime: 0 });
        } catch {
          post = undefined;
        }
        if (post && !viewerRow(post, username)) {
          setRecommendState(username, author, permlink, { phase: "withdrawn" });
          pinged.delete(recommendKey(username, author, permlink));
          invalidateRecommendationFeeds(queryClient, username);
          patchRecommendCounts(queryClient, post);
          return true;
        }
        if (!post) return false;
      }
      await run(true);
      return true;
    } finally {
      withdrawing.delete(key);
    }
  }, [run, username, author, permlink, queryClient]);

  // No `isPending` here on purpose: the mutation observer is per hook instance
  // and the quick view keeps one button mounted across rows; the keyed state
  // carries "pending" for exactly the recommendation it belongs to.
  return { state, recommend, withdraw, username };
}

/**
 * Test-only. The body is compiled out of a production bundle (`NODE_ENV` is a
 * literal there), so the export costs a name and nothing else.
 */
export function resetRecommendFlowForTests() {
  if (process.env.NODE_ENV === "production") return;
  for (const key of Array.from(timers.keys())) clearTimers(key);
  pinged.clear();
  withdrawing.clear();
  activeUser = NO_USER;
}

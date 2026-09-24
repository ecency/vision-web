import { isServer } from "@tanstack/react-query";
import { getQueryClient } from "./index";
import {
  useQuery,
  useInfiniteQuery,
  UseQueryOptions,
  UseInfiniteQueryOptions,
  InfiniteData
} from "@tanstack/react-query";
import type {
  FetchQueryOptions,
  FetchInfiniteQueryOptions,
  QueryClient,
  QueryKey
} from "@tanstack/query-core";
import { EcencyConfigManager } from "@/config";
import { isHiveNotFoundError } from "@/utils/hive-not-found-error";

// Hard ceiling on any single SSR prefetch. Must be under nginx's
// proxy_read_timeout for SSR (20s in infra/origin) so the render completes before
// nginx closes the connection. When this fires, the prefetch is skipped
// and client-side React Query will refetch on hydration.
const SSR_PREFETCH_TIMEOUT_MS = 10_000;

/**
 * Flag the current server response as rendered without some of its data, so
 * the ssr-degraded.js preload sends it `private, no-store` and no shared cache
 * keeps it. A no-op in the browser and wherever the preload is not loaded
 * (dev, tests). Exported for a caller whose fallback answered but lost data
 * the page needs (`fallback-incomplete`).
 */
export function markSsrDegraded(
  reason: "prefetch-timeout" | "prefetch-error" | "fallback-incomplete"
) {
  if (!isServer) return;
  (
    globalThis as { __ecencySsrDegraded?: { mark(reason: string): void } }
  ).__ecencySsrDegraded?.mark(reason);
}

/**
 * Race a promise against a timeout with real cancellation.
 *
 * When the timeout fires, cancels the in-progress React Query fetch via
 * `cancelQueries()`, which aborts the signal passed to the queryFn. If
 * the queryFn forwards that signal to `callRPC` (hive-tx >=7.3.0) or
 * `fetch()`, the underlying TCP connection is torn down immediately
 * instead of running as a zombie until it naturally completes.
 *
 * Resolves to undefined on timeout or rejection so SSR renders gracefully
 * degrade, and marks the response degraded (markSsrDegraded) unless the
 * rejection is a node's not-found answer or the caller opted out (`mark`).
 */
function withSsrTimeout<T>(
  promise: Promise<T>,
  queryKey?: QueryKey,
  mark = true
): Promise<T | undefined> {
  if (!isServer) return promise;

  return new Promise<T | undefined>((resolve) => {
    const timer = setTimeout(() => {
      // Cancel the in-flight query — sends abort signal to queryFn
      if (queryKey) {
        getQueryClient().cancelQueries({ queryKey });
      }
      if (mark) markSsrDegraded("prefetch-timeout");
      resolve(undefined);
    }, SSR_PREFETCH_TIMEOUT_MS);

    promise
      .then((result) => { clearTimeout(timer); resolve(result); })
      .catch((error) => {
        clearTimeout(timer);
        if (mark && !isHiveNotFoundError(error)) markSsrDegraded("prefetch-error");
        resolve(undefined);
      });
  });
}

/**
 * `qc.prefetchQuery` never rejects: a failed fetch (RPC 5xx, every node
 * exhausted) resolves with the query in error state, so withSsrTimeout's catch
 * never sees it. A node's not-found answer (bridge.get_post asserts on a missing
 * post) is an error too, but a real one: those pages keep their normal caching
 * (isHiveNotFoundError). Only Cache-Control changes; a page that answers
 * notFound() after a failed lookup still sends its 404.
 */
// Takes the client the prefetch ran on: outside a Flight request (route
// handlers) React cache() does not memoise, so resolving it again would give
// a fresh client that never saw the error.
function markIfPrefetchFailed(qc: QueryClient, queryKey: QueryKey) {
  if (!isServer) return;
  const state = qc.getQueryState(queryKey);
  if (state?.status === "error" && !isHiveNotFoundError(state.error)) {
    markSsrDegraded("prefetch-error");
  }
}

export interface SsrPrefetchOptions {
  /**
   * Default true. Pass false only for a source the caller falls back from
   * (condenser get_content, then bridge.get_post): a failure or timeout here
   * then leaves the response cacheable, and the fallback's own prefetch marks
   * it if the data is still missing. Scoped to this one call, so it can never
   * clear a mark another query set.
   */
  degradeOnFailure?: boolean;
}

/**
 * Prefetch a query on the server and return cached data.
 * Replaces the old `.prefetch()` method from EcencyQueriesManager.
 *
 * On the server, each prefetch is bounded by SSR_PREFETCH_TIMEOUT_MS.
 * If the RPC call hangs, the prefetch is skipped and client-side
 * React Query will refetch after hydration - preventing zombie SSR
 * renders that run for minutes after nginx closes the connection.
 *
 * @example
 * // Server Component
 * const entry = await prefetchQuery(getPostQueryOptions(author, permlink));
 */
export async function prefetchQuery<
  T,
  TKey extends QueryKey = QueryKey
>(
  options: FetchQueryOptions<T, Error, T, TKey>,
  { degradeOnFailure = true }: SsrPrefetchOptions = {}
) {
  const qc = getQueryClient();
  await withSsrTimeout(qc.prefetchQuery(options), options.queryKey, degradeOnFailure);
  if (degradeOnFailure) markIfPrefetchFailed(qc, options.queryKey);
  return qc.getQueryData<T>(options.queryKey);
}

/**
 * Prefetch an infinite query on the server and return cached data.
 * Replaces the old `.prefetch()` method for infinite queries.
 *
 * @example
 * // Server Component
 * const posts = await prefetchInfiniteQuery(getAccountPostsInfiniteQueryOptions(username));
 */
export async function prefetchInfiniteQuery<
  TPage,
  TCursor,
  TKey extends QueryKey = QueryKey
>(options: FetchInfiniteQueryOptions<TPage, Error, TPage, TKey, TCursor>) {
  const qc = getQueryClient();
  await withSsrTimeout(qc.prefetchInfiniteQuery(options), options.queryKey);
  markIfPrefetchFailed(qc, options.queryKey);
  return qc.getQueryData<InfiniteData<TPage, TCursor>>(options.queryKey);
}

/**
 * Server-safe fetchQuery with SSR timeout.
 * Unlike prefetchQuery (which swallows errors), this returns data directly.
 * On timeout, returns undefined instead of hanging.
 */
export async function fetchQuery<T, TKey extends QueryKey = QueryKey>(
  options: FetchQueryOptions<T, Error, T, TKey>
): Promise<T | undefined> {
  const qc = getQueryClient();
  return withSsrTimeout(qc.fetchQuery(options), options.queryKey);
}

/**
 * Server-safe fetchInfiniteQuery with SSR timeout.
 * Returns the infinite query data, or undefined on timeout.
 */
export async function fetchInfiniteQuery<TPage, TCursor>(
  options: FetchInfiniteQueryOptions<TPage, Error, TPage, any, TCursor>
): Promise<InfiniteData<TPage, TCursor> | undefined> {
  const qc = getQueryClient();
  return withSsrTimeout(qc.fetchInfiniteQuery(options as any), options.queryKey);
}

/**
 * Get cached query data synchronously.
 * Replaces the old `.getData()` method from EcencyQueriesManager.
 *
 * @example
 * // Server or Client Component
 * const entry = getQueryData(getPostQueryOptions(author, permlink));
 */
export function getQueryData<T>(options: { queryKey: QueryKey }) {
  return getQueryClient().getQueryData<T>(options.queryKey);
}

/**
 * Get cached infinite query data synchronously.
 * Replaces the old `.getData()` method for infinite queries.
 *
 * @example
 * // Server or Client Component
 * const posts = getInfiniteQueryData(getAccountPostsInfiniteQueryOptions(username));
 */
export function getInfiniteQueryData<TPage, TCursor>(
  options: { queryKey: QueryKey }
) {
  return getQueryClient().getQueryData<InfiniteData<TPage, TCursor>>(options.queryKey);
}

/**
 * Apply feature flag gating to query options.
 * Replaces the old `generateConfiguredClientServerQuery` method.
 *
 * @example
 * export const getPointsQuery = (username?: string) =>
 *   withFeatureFlag(
 *     ({ visionFeatures }) => visionFeatures.points.enabled,
 *     getPointsQueryOptions(username)
 *   );
 */
export function withFeatureFlag<
  T extends UseQueryOptions<any, any, any, any> | UseInfiniteQueryOptions<any, any, any, any, any>
>(condition: EcencyConfigManager.ConfigBasedCondition, options: T): T {
  return {
    ...options,
    enabled: (options.enabled ?? true) && condition(EcencyConfigManager.CONFIG)
  };
}

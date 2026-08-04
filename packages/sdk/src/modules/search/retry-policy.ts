import { isServer } from "@tanstack/react-query";
import type { RequestError } from "./parse-json-response";

/**
 * The app-wide default the browser QueryClient uses. Restated because supplying
 * a `retry` callback replaces React Query's own budget rather than adding to it.
 *
 * The 0 on the server is load-bearing: server QueryClients set `retry: false`
 * globally, and these queries are prefetched during SSR, so a flat 3 would
 * resurrect SSR retries against a single-region backend.
 */
const MAX_RETRIES = isServer ? 0 : 3;

/**
 * Shared retry rule for every /search-api call.
 *
 * A 4xx is the backend rejecting the query itself (too many tags, over the
 * length cap, nothing left to search once the filters are parsed out).
 * Repeating it repeats the same answer, so the only effect is four requests
 * over several seconds before the UI can say what to change.
 *
 * 408 and 429 are the exceptions: they describe when the request arrived rather
 * than what it contained, and backing off is what resolves them. A client-side
 * timeout aborts the fetch and carries no status at all, so it falls through to
 * the normal budget like any other transport failure.
 */
export function searchRetryPolicy(failureCount: number, error: Error): boolean {
  const { status } = error as RequestError;
  const isTransient = status === 408 || status === 429;

  if (status !== undefined && status >= 400 && status < 500 && !isTransient) {
    return false;
  }

  return failureCount < MAX_RETRIES;
}

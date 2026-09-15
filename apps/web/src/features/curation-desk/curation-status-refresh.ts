import type { QueryClient } from "@tanstack/react-query";
import { QueryKeys } from "@ecency/sdk";

/** The gateway's s-maxage for the status route: a read inside it can answer from before a write. */
const STATUS_MEMO_MS = 15_000;

let settleTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * The status counts move with every mark, dismissal and recommendation, and
 * the tab badges read them. The gateway memoizes the route for up to 15 s, so a
 * read right after the write can still carry the old counts: status is read
 * now and once more after that window. A run of writes shares the second read,
 * each write pushing it out.
 */
export function refreshCurationStatus(queryClient: QueryClient): void {
  const queryKey = QueryKeys.curation.status();
  void queryClient.invalidateQueries({ queryKey });
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    settleTimer = null;
    void queryClient.invalidateQueries({ queryKey });
  }, STATUS_MEMO_MS + 1_000);
}

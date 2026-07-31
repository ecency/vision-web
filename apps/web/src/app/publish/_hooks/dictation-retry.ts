export type DictationRetryAction = "resolve-token" | "refetch-price" | "none";

/**
 * What the single retry button should actually do.
 *
 * The two failures look the same to the user but need opposite handling. On a
 * session failure the pricing query is *disabled* for want of a token, and
 * `refetch()` bypasses `enabled` -- so retrying pricing there fires an
 * unauthenticated request. That request errors, and because the query is keyed by
 * username alone its key does not change when a token finally arrives, so the
 * failure sticks and the user has to retry a second time.
 *
 * Resolving the token is enough on its own: the query enables itself once a token
 * exists and fetches because it has no successful data yet.
 */
export function nextRetryAction(
  tokenState: "pending" | "ready" | "failed",
  isPriceError: boolean
): DictationRetryAction {
  if (tokenState === "failed") {
    return "resolve-token";
  }
  if (tokenState === "ready" && isPriceError) {
    return "refetch-price";
  }
  return "none";
}

import { getAccountPostsQueryOptions } from "@ecency/sdk";
import {
  queryOptions,
  type QueryFunctionContext,
  type UseQueryOptions
} from "@tanstack/react-query";
import type { Entry } from "@/entities";

/** The two fields the pending-earnings total is computed from. */
export interface PendingPayout {
  payout_at: string;
  pending_payout_value: string;
}

const RECENT_LIMIT = 20;

/**
 * Recent posts or comments, reduced to the payout fields on arrival.
 *
 * The wallet total reads `payout_at` and `pending_payout_value` and nothing
 * else, but the bridge answers with whole entries: measured across four active
 * accounts, the two calls this component makes retain about 660 KB each time
 * the wallet is opened, roughly 100 KB of post bodies and 500 KB of voter
 * records, to produce one number. Projecting on arrival keeps 2.8 KB of it.
 *
 * The wire cost is unchanged: the bridge sends what it sends, and only an
 * endpoint of our own or a field on the account could avoid that. What this
 * buys is retained memory, which is the thing that bounds how many renderer
 * replicas fit on a host.
 *
 * The key carries its own marker. `accountPostsPage` is read by the waves
 * composer and the decks user column, which need whole entries, and handing
 * either of them a projected row would be the fault that issue #1556 was.
 */
/** Appended to the SDK page key so whole-entry readers cannot pick these up. */
export const PENDING_PAYOUTS_KEY = "pending-payouts";

export function pendingPayoutsQueryOptions(
  username: string,
  sort: "posts" | "comments"
): UseQueryOptions<PendingPayout[], Error, PendingPayout[]> {
  const base = getAccountPostsQueryOptions(username, sort, "", "", RECENT_LIMIT, "");
  const fetchEntries = base.queryFn as (
    ctx: QueryFunctionContext
  ) => Promise<Entry[] | null | undefined>;

  // Built rather than spread: spreading carries the SDK's own `Entry[]` result
  // type, which this deliberately narrows.
  // Widened deliberately: the SDK brands its own key tuple, and spreading that
  // brand into this key makes it unassignable to the declared return type.
  const queryKey: readonly unknown[] = [...base.queryKey, PENDING_PAYOUTS_KEY];

  return queryOptions({
    queryKey,
    // The context is forwarded, not dropped: the SDK query reads `signal` from
    // it and hands it to the bridge call, so without this a wallet the reader
    // has navigated away from keeps downloading entries nobody will look at,
    // which is the opposite of the point.
    queryFn: async (ctx): Promise<PendingPayout[]> => {
      const entries = (await fetchEntries(ctx)) ?? [];
      return entries
        // The node is asked for one account's posts, and only that account's
        // payouts belong in its total. A node answering with anything else,
        // which is not hypothetical for this network, must not move the number.
        .filter((entry) => entry.author === username)
        .map((entry) => ({
          payout_at: entry.payout_at,
          pending_payout_value: entry.pending_payout_value
        }));
    }
  });
}

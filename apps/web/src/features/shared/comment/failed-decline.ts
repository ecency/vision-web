import * as ls from "@/utils/local-storage";

// A failed DECLINED reply keeps its exact text under the sending account and the
// parent post; the composer re-applies the decline only while its draft is still
// that text. A declined payout cannot be undone on chain, so nothing else checks it.
export function failedDeclineKey(username: string, author: string, permlink: string) {
  return `reply_failed_decline_${username}_${author}_${permlink}`;
}

// Record a failure's payout choice for its sender: declined stores the text, and an
// undeclined failure of the same text drops an earlier decline (the last failure wins).
export function rememberFailedDecline(
  username: string,
  author: string,
  permlink: string,
  text: string,
  declinePayout: boolean
) {
  if (!username) return;
  const key = failedDeclineKey(username, author, permlink);
  if (declinePayout) {
    ls.set(key, text);
  } else if (ls.get(key) === text) {
    ls.remove(key);
  }
}

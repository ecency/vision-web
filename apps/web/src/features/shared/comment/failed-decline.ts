import * as ls from "@/utils/local-storage";
import { isBlankBody } from "@/utils";

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

// A failed reply kept for its sender alone, when another account (or nobody) was
// signed in as it failed: the reply draft is shared by every account on this
// browser, so it waits here until the sender's own form opens on the post.
export function failedTextKey(username: string, author: string, permlink: string) {
  return `reply_failed_text_${username}_${author}_${permlink}`;
}

// A reply whose broadcast failed goes back into its post's reply draft (the form
// cleared it on submit), with the payout choice it was sent with, so whichever
// reply box opens on that post next finds it, even when the one that sent it is
// gone (#2104). Called from the reply mutation's failure path, for every box.
export function keepFailedReply(
  username: string,
  author: string,
  permlink: string,
  text: string,
  declinePayout: boolean,
  { senderSignedIn }: { senderSignedIn: boolean }
) {
  if (!username) return;
  // Not signed in as the sender: keep it for the sender alone, never in the
  // shared draft another account's composer would open with.
  if (!senderSignedIn) {
    ls.set(failedTextKey(username, author, permlink), text);
    rememberFailedDecline(username, author, permlink, text, declinePayout);
    return;
  }
  // Only into a blank draft or one already holding this text: a newer draft the
  // writer started meanwhile stays theirs, and so does its stored decline.
  const draftKey = `reply_text_${author}_${permlink}`;
  const draft = ls.get(draftKey);
  const draftFree = draft === null || draft === text || (typeof draft === "string" && isBlankBody(draft));
  if (draftFree) {
    ls.set(draftKey, text);
  }
  // An undeclined failure may still drop this text's own stale decline.
  if (draftFree || !declinePayout) {
    rememberFailedDecline(username, author, permlink, text, declinePayout);
  }
}

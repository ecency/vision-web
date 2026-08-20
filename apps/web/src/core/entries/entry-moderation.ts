import { ContentModerationReason, getContentModerationReason } from "@ecency/sdk";
import { Entry } from "@/entities";

// A body the SDK's outbound-link check is guaranteed to flag: not a Hive/Ecency
// host, not an image host, not an image extension. It never renders anywhere — it
// exists only to replay one precomputed bit into the SDK rule below.
const EXTERNAL_LINK_STANDIN = "https://slim-entry.invalid/link";

/**
 * Which moderation rule fires for an entry, slim feed rows included.
 *
 * The SDK owns the rules and their precedence so web and mobile flag the same
 * posts. One of them (LOW_TRUST) reads the body for an outbound promotional link,
 * which a slim feed entry no longer has, so the slim step records the answer and
 * this replays it as a stand-in body. Everything else the rules read — reputation,
 * rshares, vote count, hivemind's gray/hide — is still on the entry, and stays
 * live when the feed poll merges fresh stats in.
 */
export function getEntryModerationReason(
  entry: Entry | undefined | null
): ContentModerationReason | null {
  if (entry && !entry.body && entry.slim) {
    return getContentModerationReason({
      ...entry,
      body: entry.slim.ext_link ? EXTERNAL_LINK_STANDIN : ""
    });
  }

  return getContentModerationReason(entry);
}

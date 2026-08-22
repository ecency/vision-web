/** The tagless global feed is spelled `global` in the URL. */
const GLOBAL_FEED_TAG = "global";

/**
 * What hivemind accepts as a tag, established by probing a node (2026-08-22):
 * `Photography`, `te st`, `shepherd's`, `playingtogether!`, `daily.prompt` and
 * `tëst` are all refused with ``Assert Exception:invalid tag `X` ``, while
 * `a-b_c` and `hive-125` pass validation and fail only on existence — a
 * different error, and a legitimate answer.
 */
const HIVEMIND_TAG = /^[a-z0-9_-]+$/;

/** `@account` feeds go to a different hivemind method with its own rules. */
const isAccountFeed = (tag: string) => tag.startsWith("@") || tag.startsWith("%40");

export interface FeedTag {
  /** The tag to query and to build metadata from. */
  tag: string;
  /** False when hivemind is certain to reject it, whatever we ask for. */
  queryable: boolean;
}

/**
 * Normalises a feed URL's tag segment.
 *
 * Two separate problems, both visible in production:
 * - **Case.** A tag typed or linked with capitals is a real tag; hivemind just
 *   will not look it up (`/hot/Flipkart` → ``invalid tag `Flipkart` ``, Sentry
 *   ECENCY-NEXT-1GN9). Lowercasing turns an empty page into the right feed,
 *   and one origin sees ~200 such requests a day.
 * - **Shape.** A tag carrying a space, an apostrophe, a dot or non-ASCII
 *   cannot be valid however it is cased, so querying it spends a round trip to
 *   be told so and raises an error the page then swallows. Those render the
 *   same empty feed either way, so the query is skipped instead.
 */
export function normalizeFeedTag(rawTag: string): FeedTag {
  const tag = rawTag === GLOBAL_FEED_TAG ? "" : rawTag.toLowerCase();
  return { tag, queryable: tag === "" || isAccountFeed(tag) || HIVEMIND_TAG.test(tag) };
}

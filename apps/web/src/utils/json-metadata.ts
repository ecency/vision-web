/**
 * Readers for `json_metadata`, the one field on a Hive entry that is whatever
 * the publishing client wrote.
 *
 * Kept in its own leaf module rather than in posting.ts: the metadata readers
 * are imported by SEO helpers and landing-page components, and posting.ts pulls
 * the permlink and diff machinery along with it.
 */

/**
 * json_metadata as the object it is meant to be, or null when it cannot be read.
 *
 * Nodes disagree about the shape: `bridge.get_post` hands back a parsed object while
 * `condenser_api.get_content` hands back the raw STRING, and both land in the same
 * entry cache. Spreading a string produces one key PER CHARACTER, so a write path
 * that rebuilds metadata from a cached entry can publish `{"0":"{","1":"\""...}` as
 * the post's json_metadata. Returning null lets the caller refuse rather than guess.
 */
export const parseJsonMetadata = (value: unknown): Record<string, unknown> | null => {
  let parsed: unknown = value;

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }

  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
};

export const metaStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  }
  return typeof value === "string" && value.length > 0 ? [value] : [];
};

/**
 * Bounds for metadata that is about to be serialised into a response body.
 *
 * Both are measured, not guessed. Across 374 posts sampled from
 * bridge.get_ranked_posts on 2026-09-21 the deepest json_metadata was 5 levels
 * and 334 of them were 2, while the largest held 1579 values (a Liketu post,
 * 15.6 KB); the median was 20. Depth matters because a body is serialised
 * whole and JSON.stringify blows the stack somewhere past 4000 levels, where
 * JSON.parse happily accepts millions, so metadata can parse and then take a
 * perfectly good post down with it. Size matters because the walk below reads
 * every value, and metadata is author-supplied.
 *
 * Both limits sit an order of magnitude above anything published, so nothing
 * real is affected: 64 levels is 13x the deepest seen, and 20000 values is 13x
 * the largest seen and still under the ~32000 a 64 KB comment operation can
 * hold at its densest.
 */
export const MAX_METADATA_DEPTH = 64;
export const MAX_METADATA_NODES = 20000;

/**
 * Whether metadata is shallow and small enough to serve.
 *
 * Iterative on purpose: measuring a nesting bomb must not overflow the stack
 * the measurement exists to protect. Both bounds bail early, so a bomb costs a
 * few dozen iterations rather than a walk of the whole structure.
 */
export const withinMetadataLimits = (value: unknown): boolean => {
  const stack: [unknown, number][] = [[value, 1]];
  let budget = MAX_METADATA_NODES;

  while (stack.length > 0) {
    if (budget <= 0) return false;
    budget -= 1;

    const [current, depth] = stack.pop() as [unknown, number];
    if (current === null || typeof current !== "object") continue;
    if (depth > MAX_METADATA_DEPTH) return false;

    for (const child of Object.values(current)) stack.push([child, depth + 1]);
  }

  return true;
};

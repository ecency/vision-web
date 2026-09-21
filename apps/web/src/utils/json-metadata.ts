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

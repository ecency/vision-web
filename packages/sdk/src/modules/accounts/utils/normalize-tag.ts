const TAG_PATTERN = /^[a-z0-9-]{1,32}$/;
const COMMUNITY_PATTERN = /^hive-\d+$/;

/**
 * The one place a followed tag is normalised before it is sent or used as a cache
 * key: trimmed, lowercased, one leading `#` dropped, then validated. Mirrors the
 * server rule exactly, so a value that passes here is stored as-is.
 *
 * Returns null for anything that is not a usable tag, including a community name
 * (`hive-123456`): communities are subscribed to on chain, not followed as tags.
 */
export function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  let tag = raw.trim().toLowerCase();
  if (tag.startsWith("#")) {
    tag = tag.slice(1);
  }

  if (!TAG_PATTERN.test(tag) || COMMUNITY_PATTERN.test(tag)) {
    return null;
  }

  return tag;
}

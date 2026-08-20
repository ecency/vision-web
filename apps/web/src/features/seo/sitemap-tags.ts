/**
 * Pure helpers for the sitemap "tags.xml" shard: harvesting tag popularity
 * from the freshness walk and selecting the emittable top-N tag hub URLs.
 *
 * Kept out of the route handler so the selection rules (valid bare Hive tag,
 * community/NSFW exclusion, min-count + cap, deterministic order) are
 * unit-testable without the live RPC/Redis surface — mirroring the pure
 * allowlist split in sitemap-shards.ts.
 *
 * Why /created/<tag>: that is the canonical, internally-linked tag feed. The
 * shared TagLink (and community pages) default to the `created` filter, and
 * each feed page self-canonicals to /<filter>/<tag>. Listing /created/<tag>
 * reinforces the URL crawlers already see linked instead of introducing a
 * competing /trending/ surface. Community ids (hive-NNN) are excluded here:
 * communities.xml already emits them as /created/hive-NNN, so listing them
 * again would duplicate that shard.
 */
import { isNsfwTag } from "@/utils/nsfw-detection";

// A valid bare Hive tag for a public feed hub: lowercase, starts/ends
// alphanumeric, internal hyphens allowed, 1–50 chars. This rejects "@author"
// feeds (not a tag), empty/whitespace, uppercase, and any non-ASCII tag — the
// last on purpose: /created/<loc> is emitted verbatim (no percent-encoding),
// so we only list URL-safe ASCII tags. Non-latin tags' posts still appear in
// posts.xml; only the aggregated hub page is skipped.
const TAG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
const COMMUNITY_RE = /^hive-\d+$/;

export function isEmittableTag(tag: string): boolean {
  if (!TAG_RE.test(tag)) return false;
  if (COMMUNITY_RE.test(tag)) return false; // owned by communities.xml
  if (isNsfwTag(tag)) return false;
  return true;
}

/**
 * Fold one post's category + json_metadata tags into `counts` (lowercased /
 * trimmed). Deduped within the post so a post whose category repeats a tag — or
 * whose tags array has duplicates — contributes at most +1 to each tag, keeping
 * the count an honest "posts using this tag" popularity signal.
 */
export function harvestPostTags(
  counts: Map<string, number>,
  category: string | null | undefined,
  tags: readonly unknown[] | null | undefined,
  // Optional: newest post day (YYYY-MM-DD) per tag, so the tag hub shard can
  // carry a real lastmod instead of stamping today on every entry.
  latest?: Map<string, string>,
  day?: string
): void {
  const inPost = new Set<string>();
  const add = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const t = raw.toLowerCase().trim();
    if (t) inPost.add(t);
  };
  add(category);
  if (Array.isArray(tags)) for (const t of tags) add(t);
  inPost.forEach((t) => {
    counts.set(t, (counts.get(t) ?? 0) + 1);
    if (latest && day) {
      const prev = latest.get(t);
      if (!prev || day > prev) latest.set(t, day);
    }
  });
}

/**
 * The emittable top-N tags by popularity. Deterministic: count desc, then tag
 * asc — a stable order across runs (stable sitemap, testable). `minCount` drops
 * one-off long-tail tags that are noise as standalone hub pages.
 */
export function selectTopTags(
  counts: ReadonlyMap<string, number>,
  limit: number,
  minCount: number
): string[] {
  return Array.from(counts.entries())
    .filter(([tag, n]) => n >= minCount && isEmittableTag(tag))
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, limit)
    .map(([tag]) => tag);
}

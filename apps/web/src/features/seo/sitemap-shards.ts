/**
 * The canonical, closed set of sitemap child-shard names — the single source
 * of truth shared by the generator (writer, /api/internal/seo/sitemap-generate)
 * and the public shard route (reader/validator, /sitemap/[shard]).
 *
 * Using an exact allowlist instead of a permissive regex removes a whole class
 * of silent failures: a generator/route case or formatting mismatch can't make
 * a shard 404 invisibly, and there's no Redis-key-injection surface. Adding a
 * shard means adding it here (and emitting it from the generator) — both sides
 * stay in lockstep by construction.
 */
export const SITEMAP_SHARDS = [
  "posts.xml",
  "authors.xml",
  "communities.xml",
  "tags.xml",
  "static.xml"
] as const;

/**
 * Shards an operator seeds straight into Redis (blob under the shard key, an
 * optional `<key>:lastmod` beside it). The generator never writes them; it
 * lists one in the sitemap index only while its blob exists, so removing the
 * key retires the shard on the next run. Used for bounded, temporary lists,
 * e.g. pages that need a recrawl after an indexability rule changed.
 */
export const OPERATOR_SHARDS = ["recovery.xml"] as const;

export type SitemapShard = (typeof SITEMAP_SHARDS)[number] | (typeof OPERATOR_SHARDS)[number];

const SHARD_SET: ReadonlySet<string> = new Set<string>([...SITEMAP_SHARDS, ...OPERATOR_SHARDS]);
const OPERATOR_SET: ReadonlySet<string> = new Set<string>(OPERATOR_SHARDS);

/** An operator shard with no blob is retired, not pending: the route 404s it. */
export function isOperatorShard(name: string): boolean {
  return OPERATOR_SET.has(name);
}

export function isKnownShard(name: string): name is SitemapShard {
  return SHARD_SET.has(name);
}

/**
 * Shard names we used to emit. After a rename, a Redis-cached index written by
 * the *previous* deploy's cron can still advertise the old name until the next
 * generation rewrites it. Serving that as a 404 would tell crawlers the shard
 * was permanently removed; the route returns 503 (transient) for these instead
 * so it's retried, then disappears from the index on the next cron run. Prune
 * an entry once every environment has regenerated past the rename.
 *
 * Currently empty, and it should stay that way outside a rename window: an
 * entry left here past its cron cycle serves a permanent 503 + Retry-After to
 * crawlers, which they retry indefinitely instead of dropping. "posts-1.xml"
 * was pruned 2026-07-22 after ~3 weeks in that state.
 */
const RETIRED_SHARDS: ReadonlySet<string> = new Set<string>();

export function isRetiredShard(name: string): boolean {
  return RETIRED_SHARDS.has(name);
}

/**
 * Serves a precomputed sitemap child shard from Redis (written by the
 * sitemap-generation cron). Thin O(1) read, CDN-cached, Node runtime
 * (ioredis).
 *
 * `shard` is the child filename referenced by the index. Validated against
 * the shared closed allowlist (`SITEMAP_SHARDS`) the generator writes — an
 * exact-membership check, not a permissive regex, so a writer/route case or
 * formatting mismatch can't make a shard 404 invisibly and there's no Redis
 * key-injection surface.
 *
 * Status semantics matter for crawlers: only a shard NOT in the allowlist is
 * 404 ("this resource doesn't exist"). A known shard that's merely not in
 * Redis yet (pre-prime) or unreachable (Redis blip) returns 503 + Retry-After
 * so the engine retries instead of dropping a real, advertised resource. A
 * just-retired shard name (a stale cached index may still link it for one
 * cron cycle after a rename) is likewise 503, never 404.
 */
import { getSeoRedisReady, SEO_REDIS_PREFIX } from "@/features/seo/seo-redis";
import { isKnownShard, isRetiredShard } from "@/features/seo/sitemap-shards";

export const dynamic = "force-dynamic";

const CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ shard: string }> }
): Promise<Response> {
  const { shard } = await params;
  // Known shard but not (yet) available, OR a just-retired name a stale
  // cached index may still link → transient, not "gone".
  const unavailable = () =>
    new Response("Service Unavailable", {
      status: 503,
      headers: { "Retry-After": "600" }
    });
  if (isRetiredShard(shard)) return unavailable();
  if (!isKnownShard(shard)) {
    return new Response("Not Found", { status: 404 });
  }
  const redis = await getSeoRedisReady();
  if (!redis) return unavailable();
  try {
    const xml = await redis.get(`${SEO_REDIS_PREFIX}sitemap:${shard}`);
    if (!xml) return unavailable();
    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": CACHE
      }
    });
  } catch {
    return unavailable();
  }
}

/**
 * Serves the precomputed sitemap index from Redis (written by the server-side
 * sitemap-generation cron — this handler never generates / scans the corpus).
 * Thin O(1) read; the CF worker/edge absorbs load via Cache-Control. Deploys
 * uniformly across all LB'd origins via the normal pipeline (no per-server
 * Nginx/static-file sync). Node runtime (ioredis).
 *
 * robots.txt advertises this URL, so an absent/unreachable index is a
 * transient 503 + Retry-After (retry later), never a 404 (don't tell the
 * crawler the sitemap doesn't exist during a pre-prime window or Redis blip).
 */
import { getSeoRedisReady, SEO_REDIS_PREFIX } from "@/features/seo/seo-redis";

export const dynamic = "force-dynamic"; // handler runs; CDN caches via headers

const INDEX_KEY = `${SEO_REDIS_PREFIX}sitemap:index`;
const CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";

const unavailable = () =>
  new Response("Service Unavailable", {
    status: 503,
    headers: { "Retry-After": "600" }
  });

export async function GET(): Promise<Response> {
  const redis = await getSeoRedisReady();
  if (!redis) return unavailable();
  try {
    const xml = await redis.get(INDEX_KEY);
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

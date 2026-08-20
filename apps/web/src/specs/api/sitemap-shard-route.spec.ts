// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, string>();
const fakeRedis = () => ({
  get: async (k: string) => store.get(k) ?? null,
  exists: async (k: string) => (store.has(k) ? 1 : 0)
});
vi.mock("@/features/seo/seo-redis", () => ({
  SEO_REDIS_PREFIX: "seo:",
  getSeoRedis: () => fakeRedis(),
  getSeoRedisReady: async () => fakeRedis()
}));

import { GET } from "@/app/sitemap/[shard]/route";

const get = (shard: string) =>
  GET(new Request(`http://web/sitemap/${shard}`), { params: Promise.resolve({ shard }) });

/**
 * Status semantics the crawlers depend on: a generated shard that is missing
 * from Redis is a transient 503 (it is advertised and will come back), an
 * unknown name is 404, and an operator shard without a blob is 404 too: the
 * blob is what makes it exist, so its absence means the operator retired it.
 */
describe("sitemap shard route", () => {
  beforeEach(() => store.clear());

  it("serves a generated shard from Redis and 503s while it is not there yet", async () => {
    expect((await get("posts.xml")).status).toBe(503);
    store.set("seo:sitemap:posts.xml", "<urlset/>");
    const res = await get("posts.xml");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<urlset/>");
  });

  it("404s an unknown name", async () => {
    expect((await get("nope.xml")).status).toBe(404);
  });

  it("serves an operator shard while seeded and 404s it once the operator removed the blob", async () => {
    expect((await get("recovery.xml")).status).toBe(404);
    store.set("seo:sitemap:recovery.xml", "<urlset/>");
    expect((await get("recovery.xml")).status).toBe(200);
    store.delete("seo:sitemap:recovery.xml");
    const gone = await get("recovery.xml");
    expect(gone.status).toBe(404);
    expect(gone.headers.get("Retry-After")).toBeNull();
  });
});

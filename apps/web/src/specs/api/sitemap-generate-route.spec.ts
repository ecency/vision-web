// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@ecency/sdk/hive", () => ({
  callRPC: vi.fn(),
  setNodes: vi.fn(),
  setUserAgent: vi.fn()
}));
vi.mock("@/features/seo/cron-auth", () => ({
  cronAuthorized: () => true,
  notFound: () => new Response("", { status: 404 })
}));
const store = new Map<string, string>();
let failNextSetMatching = "";
const fakeRedis = () => ({
    get: async (k: string) => store.get(k) ?? null,
    strlen: async (k: string) => (store.get(k) ?? "").length,
    set: async (k: string, v: string) => {
      if (failNextSetMatching && k.includes(failNextSetMatching)) {
        failNextSetMatching = "";
        throw new Error(`injected redis failure on ${k}`);
      }
      store.set(k, v);
      return "OK";
    }
});
vi.mock("@/features/seo/seo-redis", () => ({
  SEO_REDIS_PREFIX: "seo:",
  getSeoRedis: () => fakeRedis(),
  // Both accessors, so this spec holds whether the route takes the client
  // synchronously or waits for it to be ready.
  getSeoRedisReady: async () => fakeRedis()
}));

import { callRPC } from "@ecency/sdk/hive";
import { POST } from "@/app/api/internal/seo/sitemap-generate/route";
import { mockEntry } from "../test-utils";

const HOUR = 3_600_000;
// Bridge timestamps carry no zone suffix; the walk appends "Z" itself.
const stamp = (agoMs: number) => new Date(Date.now() - agoMs).toISOString().slice(0, 19);
const day = (agoMs: number) => stamp(agoMs).slice(0, 10);

// Bridge rows as the walk sees them: the shared Entry factory plus the fields
// the generator reads (created without a zone suffix, the way the bridge
// emits it, and the row's own author_reputation).
function post(author: string, permlink: string, agoMs: number, rep: number, tags: string[]) {
  return mockEntry({
    author,
    permlink,
    created: stamp(agoMs),
    updated: stamp(agoMs),
    depth: 0,
    parent_author: "",
    parent_permlink: tags[0],
    category: tags[0],
    author_reputation: rep,
    body: "A full paragraph of real prose, long enough not to read as an empty post at all.",
    json_metadata: { tags, app: "ecency/4.0" }
  });
}

// Two indexable posts by a rep-72 author (newest 2h ago), one by a rep-30
// author, then a post older than the 48h window so the walk reaches its cutoff.
const PAGE = [
  post("goodauthor", "fresh-one", 2 * HOUR, 72.4, ["photography", "travel"]),
  post("lowrep", "spammy", 3 * HOUR, 30.2, ["photography", "travel"]),
  post("goodauthor", "older-one", 20 * HOUR, 72.4, ["photography"]),
  post("ancient", "way-back", 80 * HOUR, 75, ["photography"])
];

const shard = (name: string) => store.get(`seo:sitemap:${name}`) ?? "";

const run = () => POST(new Request("http://web/api/internal/seo/sitemap-generate", { method: "POST" }));
const indexEntry = (name: string) =>
  shard("index").match(new RegExp(`<loc>https://ecency.com/sitemap/${name}</loc><lastmod>([^<]+)</lastmod>`))?.[1];

describe("sitemap-generate route", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  beforeEach(() => {
    store.clear();
    vi.mocked(callRPC).mockImplementation(async (method: string) => {
      if (method === "bridge.get_ranked_posts") return PAGE;
      if (method === "bridge.list_communities") return [];
      return [];
    });
  });

  it("drops reputation-gated rows from posts.xml and authors.xml, using the row's author_reputation", async () => {
    const res = await POST(new Request("http://web/api/internal/seo/sitemap-generate", { method: "POST" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.posts).toBe(2);
    expect(body.repGated).toBe(1);
    expect(body.reachedCutoff).toBe(true);

    const posts = shard("posts.xml");
    expect(posts).toContain("https://ecency.com/@goodauthor/fresh-one");
    expect(posts).toContain("https://ecency.com/@goodauthor/older-one");
    expect(posts).not.toContain("lowrep");

    const authors = shard("authors.xml");
    expect(authors).toContain("https://ecency.com/@goodauthor/posts");
    expect(authors).not.toContain("lowrep");
  });

  it("gives authors.xml and tags.xml a per-entry lastmod equal to the newest indexable post day", async () => {
    await POST(new Request("http://web/api/internal/seo/sitemap-generate", { method: "POST" }));
    const newest = day(2 * HOUR);
    expect(shard("authors.xml")).toContain(
      `<url><loc>https://ecency.com/@goodauthor/posts</loc><lastmod>${newest}</lastmod></url>`
    );
    // "photography" is on both indexable posts (count 2 >= TAG_MIN_COUNT); its
    // hub last changed when the newest of them was published. "travel" only
    // reaches the minimum through the gated row, so it is not a hub.
    const tags = shard("tags.xml");
    expect(tags).toContain(
      `<url><loc>https://ecency.com/created/photography</loc><lastmod>${newest}</lastmod></url>`
    );
    expect(tags).not.toContain("/created/travel");
  });

  it("stamps every index entry with the full W3C datetime of the run that last changed that shard", async () => {
    await run();
    for (const name of ["posts.xml", "authors.xml", "tags.xml", "communities.xml", "static.xml"]) {
      expect(indexEntry(name), name).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
    expect(indexEntry("authors.xml")).toBe(indexEntry("posts.xml"));
  });

  it("does not gate when the row carries no author_reputation (the page decides)", async () => {
    vi.mocked(callRPC).mockImplementation(async (method: string) => {
      if (method !== "bridge.get_ranked_posts") return [];
      const { author_reputation: _drop, ...bare } = post("unknownrep", "p", HOUR, 0, ["photography"]);
      return [bare, PAGE[3]];
    });
    const res = await POST(new Request("http://web/api/internal/seo/sitemap-generate", { method: "POST" }));
    const body = await res.json();
    expect(body.repGated).toBe(0);
    expect(shard("posts.xml")).toContain("/@unknownrep/p");
  });

  it("gates on a raw condenser-style string reputation too, and never on an empty one", async () => {
    vi.mocked(callRPC).mockImplementation(async (method: string) => {
      if (method !== "bridge.get_ranked_posts") return [];
      return [
        { ...post("rawlow", "p1", HOUR, 0, ["photography"]), author_reputation: "5000000000" }, // ~31
        { ...post("rawhigh", "p2", HOUR, 0, ["photography"]), author_reputation: "300000000000000" }, // ~74
        { ...post("blankrep", "p3", HOUR, 0, ["photography"]), author_reputation: "" },
        PAGE[3]
      ];
    });
    const body = await (await run()).json();
    expect(body.repGated).toBe(1);
    const posts = shard("posts.xml");
    expect(posts).not.toContain("/@rawlow/");
    expect(posts).toContain("/@rawhigh/p2");
    expect(posts).toContain("/@blankrep/p3");
  });

  it("advances a shard's index lastmod only when its bytes change", async () => {
    const t0 = Date.now();
    vi.useFakeTimers({ toFake: ["Date"], now: t0 });
    await run();
    const first = Object.fromEntries(
      ["posts.xml", "authors.xml", "tags.xml", "communities.xml", "static.xml"].map((n) => [n, indexEntry(n)])
    );
    // Same data an hour later: nothing changed, nothing may move.
    vi.setSystemTime(new Date(t0 + HOUR));
    await run();
    for (const [name, lastmod] of Object.entries(first)) expect(indexEntry(name), name).toBe(lastmod);
    // A new post by a new author changes posts.xml and authors.xml. tags.xml
    // keeps its bytes (same tag, same newest day) and so keeps its lastmod:
    // that is the whole point of keying the index on content, not on runs.
    vi.setSystemTime(new Date(t0 + 2 * HOUR));
    vi.mocked(callRPC).mockImplementation(async (method: string) => {
      if (method !== "bridge.get_ranked_posts") return [];
      return [post("newcomer", "hello", HOUR, 70, ["photography"]), ...PAGE];
    });
    const third = await (await run()).json();
    expect(third.posts).toBe(3);
    const later = new Date(t0 + 2 * HOUR).toISOString();
    expect(indexEntry("posts.xml")).toBe(later);
    expect(indexEntry("authors.xml")).toBe(later);
    expect(indexEntry("tags.xml")).toBe(first["tags.xml"]);
    expect(indexEntry("communities.xml")).toBe(first["communities.xml"]);
    expect(indexEntry("static.xml")).toBe(first["static.xml"]);
  });

  it("keeps the accepted walk's full timestamp when a later walk is rejected", async () => {
    const t0 = Date.now();
    vi.useFakeTimers({ toFake: ["Date"], now: t0 });
    await run();
    const accepted = indexEntry("posts.xml");
    expect(accepted).toBe(new Date(t0).toISOString());
    const acceptedPosts = shard("posts.xml");
    // An empty walk that never reaches the cutoff is rejected (0 < 50% of the
    // last accepted count): the shards and their lastmod must not move.
    vi.setSystemTime(new Date(t0 + HOUR));
    vi.mocked(callRPC).mockImplementation(async () => []);
    const body = await (await run()).json();
    expect(body.acceptedWalk).toBe(false);
    expect(shard("posts.xml")).toBe(acceptedPosts);
    expect(indexEntry("posts.xml")).toBe(accepted);
    expect(indexEntry("authors.xml")).toBe(accepted);
    expect(body.lastGoodAt).toBe(accepted);
  });

  it("re-stamps a changed shard after a write that failed between the record and the shard", async () => {
    const t0 = Date.now();
    vi.useFakeTimers({ toFake: ["Date"], now: t0 });
    await run();
    const before = indexEntry("posts.xml");
    // A new post, but Redis dies on the posts.xml write itself.
    vi.setSystemTime(new Date(t0 + HOUR));
    vi.mocked(callRPC).mockImplementation(async (method: string) => {
      if (method !== "bridge.get_ranked_posts") return [];
      return [post("newcomer", "hello", HOUR, 70, ["photography"]), ...PAGE];
    });
    failNextSetMatching = "sitemap:posts.xml";
    const failed = await run();
    expect(failed.status).toBe(500);
    expect(shard("posts.xml")).not.toContain("newcomer");
    expect(indexEntry("posts.xml")).toBe(before); // index untouched by the failed run
    // The retry sees the shard still differs from what is stored and stamps it.
    vi.setSystemTime(new Date(t0 + 2 * HOUR));
    const retry = await (await run()).json();
    expect(retry.ok).toBe(true);
    expect(shard("posts.xml")).toContain("newcomer");
    expect(indexEntry("posts.xml")).toBe(new Date(t0 + 2 * HOUR).toISOString());
  });

  it("lists an operator-seeded shard in the index only while its blob exists, with the operator's lastmod", async () => {
    await run();
    expect(shard("index")).not.toContain("recovery.xml");
    store.set("seo:sitemap:recovery.xml", "<urlset/>");
    store.set("seo:sitemap:recovery.xml:lastmod", "2026-08-18");
    await run();
    expect(indexEntry("recovery.xml")).toBe("2026-08-18");
    expect(shard("recovery.xml")).toBe("<urlset/>"); // untouched by the generator
    // Same presence rule as the public route: an empty value is "gone", so
    // the index never advertises a URL the route would 404.
    store.set("seo:sitemap:recovery.xml", "");
    await run();
    expect(shard("index")).not.toContain("recovery.xml");
    store.delete("seo:sitemap:recovery.xml");
    await run();
    expect(shard("index")).not.toContain("recovery.xml");
  });
});

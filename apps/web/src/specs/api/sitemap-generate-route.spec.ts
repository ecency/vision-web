// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

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
vi.mock("@/features/seo/seo-redis", () => ({
  SEO_REDIS_PREFIX: "seo:",
  getSeoRedis: () => ({
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string) => {
      store.set(k, v);
      return "OK";
    }
  })
}));

import { callRPC } from "@ecency/sdk/hive";
import { POST } from "@/app/api/internal/seo/sitemap-generate/route";

const HOUR = 3_600_000;
// Bridge timestamps carry no zone suffix; the walk appends "Z" itself.
const stamp = (agoMs: number) => new Date(Date.now() - agoMs).toISOString().slice(0, 19);
const day = (agoMs: number) => stamp(agoMs).slice(0, 10);

function post(author: string, permlink: string, agoMs: number, rep: number, tags: string[]) {
  return {
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
    json_metadata: { tags, app: "ecency/4.0" },
    children: 0,
    net_votes: 3,
    active_votes: []
  };
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

describe("sitemap-generate route", () => {
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

  it("stamps the hourly shards in the index with the run's full W3C datetime and static.xml with the day", async () => {
    await POST(new Request("http://web/api/internal/seo/sitemap-generate", { method: "POST" }));
    const index = shard("index");
    const entry = (name: string) =>
      index.match(new RegExp(`<loc>https://ecency.com/sitemap/${name}</loc><lastmod>([^<]+)</lastmod>`))?.[1];
    expect(entry("posts.xml")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(entry("authors.xml")).toBe(entry("posts.xml"));
    expect(entry("communities.xml")).toMatch(/T/);
    expect(entry("static.xml")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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
});

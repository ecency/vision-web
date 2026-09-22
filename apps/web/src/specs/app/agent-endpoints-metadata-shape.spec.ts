// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The agent endpoints serve PUBLIC response bodies, so the shape of
 * `json_metadata` in them is a contract, not an implementation detail. Only
 * the data layer is mocked here: the loader, the indexability gate and the
 * envelopes all run for real.
 */

const { prefetchQuery, setDmcaLists } = vi.hoisted(() => ({
  prefetchQuery: vi.fn(),
  setDmcaLists: vi.fn()
}));

vi.mock("@/core/react-query", () => ({ prefetchQuery }));
vi.mock("@ecency/sdk", () => ({
  ConfigManager: { setDmcaLists },
  getContentQueryOptions: (author: string, permlink: string) => ({
    queryKey: ["condenser", author, permlink]
  }),
  getProfilesQueryOptions: (names: string[]) => ({ queryKey: ["profiles", ...names] }),
  getDiscussionQueryOptions: (author: string, permlink: string) => ({
    queryKey: ["discussion", author, permlink]
  })
}));
vi.mock("@/core/caches", () => ({
  EcencyEntriesCacheManagement: {
    getEntryQueryByPath: (author: string, permlink: string) => ({
      queryKey: ["bridge", author, permlink]
    })
  }
}));
// The global setup mock of "@/utils" exposes two helpers only; this module
// needs safeDecodeURIComponent, taken from its own leaf module rather than by
// widening the barrel mock.
vi.mock("@/utils", async () => ({
  safeDecodeURIComponent: (
    await vi.importActual<typeof import("@/utils/safe-decode-uri")>("@/utils/safe-decode-uri")
  ).safeDecodeURIComponent
}));

import type { Entry } from "@/entities";
import { MAX_METADATA_DEPTH, MAX_METADATA_NODES } from "@/utils/json-metadata";
import { GET as agentJson } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/agent-json/route";
import { GET as agentMd } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/agent-md/route";
import { GET as agentDiscussion } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/agent-discussion/route";

const BODY = "A post body long enough to clear the thin-content floor. ".repeat(4);

// Every field but json_metadata is type-checked against Entry. json_metadata
// is deliberately `unknown` here: the shapes under test (a string, an array, a
// number) are exactly the ones the Entry type says cannot happen and the nodes
// return anyway.
type EntryFixture = Omit<Partial<Entry>, "json_metadata"> & { json_metadata?: unknown };

function entryFixture(overrides: EntryFixture = {}): Entry {
  return {
    author: "alice",
    permlink: "a-post",
    category: "hive-125125",
    title: "A post",
    body: BODY,
    created: "2026-09-21T10:00:00",
    depth: 0,
    author_reputation: 70,
    ...overrides
  } as Entry;
}

const ACCOUNT = { reputation: 70, post_count: 120 };

/**
 * Depth fixtures. The cap in agent-readable.ts is 64, so these are exact:
 * nothing here depends on where a given machine's stack gives out.
 */
const nestedTo = (depth: number, leaf: unknown = "leaf"): Record<string, unknown> => {
  const root: Record<string, unknown> = {};
  let cursor = root;
  for (let i = 1; i < depth; i += 1) {
    const next: Record<string, unknown> = {};
    cursor.a = next;
    cursor = next;
  }
  cursor.a = leaf;
  return root;
};

/** Wide rather than deep: one value per node, no nesting. */
const widerThan = (values: number) =>
  JSON.stringify({ a: Array.from({ length: values }, () => 0) });

/**
 * Far past anything JSON.stringify can emit. This fixture is 180 KB, more than
 * one comment operation holds, but the attack does not need it: `{"a":` plus
 * `}` is 6 bytes per level, so a 64 KB operation still buys ~10,900 levels,
 * twice what the serialiser can emit.
 */
const metadataBomb = () => `${'{"a":'.repeat(30000)}1${"}".repeat(30000)}`;

const leafOf = (metadata: unknown, depth: number): unknown => {
  let cursor: unknown = metadata;
  for (let i = 0; i < depth; i += 1) cursor = (cursor as Record<string, unknown>)?.a;
  return cursor;
};

/** condenser answers first; bridge answers only when `bridge` is given. */
function serve(condenser: unknown, extra: { bridge?: unknown; discussion?: unknown } = {}) {
  prefetchQuery.mockImplementation(async (options: { queryKey: readonly unknown[] }) => {
    const [kind] = options.queryKey;
    if (kind === "condenser") return condenser;
    if (kind === "bridge") return extra.bridge ?? null;
    // Passed through, not defaulted: prefetchQuery resolves undefined on a
    // failure and the tests need that exact value.
    if (kind === "discussion") return extra.discussion;
    return [ACCOUNT];
  });
}

const params = Promise.resolve({ category: "hive-125125", author: "alice", permlink: "a-post" });

const request = (ext: string) => new Request(`https://ecency.com/@alice/a-post${ext}`);

async function jsonEnvelope() {
  const res = await agentJson(request(".json"), { params });
  return { res, payload: res.status === 200 ? JSON.parse(await res.text()) : null };
}

// Captured at module scope: the loaders run when the route modules are
// imported above, and the describes below clear mocks in beforeEach.
const listsAtImport = setDmcaLists.mock.calls[0]?.[0] as { posts: string[] } | undefined;

describe("the route module", () => {
  it("loads the takedown lists, which nothing else does for a route handler", () => {
    // App Router route handlers never execute the root layout, so sdk-init
    // never runs here and the SDK's filters would check an empty list (#1862).
    // Reads the module-scope snapshot, not the live mock: sibling describes
    // clear mocks in beforeEach, so this passed only while it happened to be
    // declared first. Not a call COUNT either: the loader is idempotent by
    // design so any entry point can load the policy without knowing whether
    // another already did.
    expect(listsAtImport).toBeDefined();
    expect(listsAtImport?.posts.length).toBeGreaterThan(0);
  });

  // The real published list, so this also proves the list file and the gate
  // agree on the path shape.
  const listedParams = Promise.resolve({
    category: "hive-125125",
    author: "boombaam1",
    permlink: "coinbase-customer-service-1-8o8-e007d0f9ebe"
  });
  const listedRequest = (ext: string) =>
    new Request(`https://ecency.com/@boombaam1/coinbase-customer-service-1-8o8-e007d0f9ebe${ext}`);

  it.each([
    [".md", agentMd],
    [".json", agentJson],
    [".discussion.json", agentDiscussion]
  ])("404s %s for a taken-down post instead of serving the notice", async (ext, handler) => {
    // llms.txt promises these endpoints 404 whatever is suppressed for policy
    // reasons, and a machine has no use for the notice a reader is shown. The
    // check has to precede the indexability gate: the filter blanks the
    // metadata and rewrites the body, removing the very signals the gate would
    // otherwise reject the post on (#1862).
    // `serve` gives it a real profile and a real thread, so the post is
    // otherwise fully indexable: without the takedown check these are 200.
    const listed = entryFixture({
      author: "boombaam1",
      permlink: "coinbase-customer-service-1-8o8-e007d0f9ebe"
    });
    serve(listed, { discussion: { "boombaam1/coinbase": listed } });

    const res = await handler(listedRequest(ext), { params: listedParams });

    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("copyright");
  });
});

describe("GET /@author/permlink.json", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serves json_metadata as an object when condenser_api answered with a string", async () => {
    serve(entryFixture({ json_metadata: '{"app":"scrobble.life/1.0","tags":["music","alive"]}' }));

    const { res, payload } = await jsonEnvelope();

    expect(res.status).toBe(200);
    expect(payload.source).toBe("hive_condenser");
    expect(payload.content.json_metadata.tags).toEqual(["music", "alive"]);
    expect(payload.content.json_metadata.app).toBe("scrobble.life/1.0");
  });

  it.each([
    ["unparseable json", "{not json"],
    ["an empty string", ""],
    ["a json array", "[1,2,3]"],
    ["a json number", "42"],
    ["the string null", "null"],
    ["a quoted string", '"just text"'],
    // A JSON string containing JSON: real publishing clients have produced it.
    // Recoverable before, dropped now, same as every in-app reader treats it.
    ["double-encoded metadata", '"{\\"tags\\":[\\"music\\"]}"'],
    ["null", null],
    ["undefined", undefined],
    ["an array", [1, 2, 3]]
  ])("serves %s as an empty object rather than its raw value", async (_label, value) => {
    serve(entryFixture({ json_metadata: value }));

    const { payload } = await jsonEnvelope();

    expect(payload.content.json_metadata).toEqual({});
  });

  it("keeps metadata that is deep but still within the cap, untouched", async () => {
    // The point of capping rather than dropping on a failed serialisation:
    // deep metadata that serialises fine must survive intact.
    // Exactly at the cap: one level deeper is the next case.
    serve(entryFixture({ json_metadata: JSON.stringify(nestedTo(64)) }));

    const { res, payload } = await jsonEnvelope();

    expect(res.status).toBe(200);
    expect(leafOf(payload.content.json_metadata, 64)).toBe("leaf");
  });

  it("empties metadata nested past the cap", async () => {
    serve(entryFixture({ json_metadata: JSON.stringify(nestedTo(65)) }));

    const { payload } = await jsonEnvelope();

    expect(payload.content.json_metadata).toEqual({});
  });

  it("keeps metadata holding fewer values than the budget", async () => {
    serve(entryFixture({ json_metadata: widerThan(MAX_METADATA_NODES - 10) }));

    const { res, payload } = await jsonEnvelope();

    expect(res.status).toBe(200);
    expect((payload.content.json_metadata.a as unknown[]).length).toBe(MAX_METADATA_NODES - 10);
  });

  it("empties metadata holding more values than the budget", async () => {
    // Reading every value of author-supplied metadata is the one unbounded
    // step left, so width is bounded as well as depth.
    serve(entryFixture({ json_metadata: widerThan(MAX_METADATA_NODES + 10) }));

    const { payload } = await jsonEnvelope();

    expect(payload.content.json_metadata).toEqual({});
  });

  it("serves a post whose metadata is a nesting bomb instead of 404ing it", async () => {
    // Nesting this deep parses (V8's parser is not recursive) and would throw
    // in JSON.stringify, taking the whole post down with it. The post is worth
    // more than its metadata.
    serve(entryFixture({ json_metadata: metadataBomb() }));

    const { res, payload } = await jsonEnvelope();

    expect(res.status).toBe(200);
    expect(payload.content.body).toBe(BODY);
    expect(payload.content.json_metadata).toEqual({});
  });

  it("caps it the same way when the node itself returned it parsed", async () => {
    // The bridge shape arrives already parsed, so a check that only ran on the
    // string path would miss this entirely.
    serve(entryFixture({ json_metadata: nestedTo(5000) }));

    const { res, payload } = await jsonEnvelope();

    expect(res.status).toBe(200);
    expect(payload.content.json_metadata).toEqual({});
  });

  it("caps the metadata of every entry a cross-post quotes, down the chain", async () => {
    // original_entry is serialised into the same body, it can itself quote
    // another entry, and the copies are shallow, so a chain would otherwise
    // travel unchecked.
    serve(
      entryFixture({
        json_metadata: '{"tags":["music"]}',
        original_entry: entryFixture({
          author: "bob",
          json_metadata: nestedTo(5000),
          original_entry: entryFixture({ author: "carol", json_metadata: nestedTo(5000) })
        })
      })
    );

    const { res, payload } = await jsonEnvelope();

    expect(res.status).toBe(200);
    expect(payload.content.json_metadata).toEqual({ tags: ["music"] });
    expect(payload.content.original_entry.json_metadata).toEqual({});
    expect(payload.content.original_entry.original_entry.json_metadata).toEqual({});
  });

  it("emits json_metadata even for a post that has no such field at all", async () => {
    const entry = entryFixture() as Partial<Entry>;
    delete entry.json_metadata;
    serve(entry);

    const { payload } = await jsonEnvelope();

    expect(payload.content).toHaveProperty("json_metadata", {});
  });

  it("passes metadata that already arrived parsed through unchanged", async () => {
    serve(entryFixture({ json_metadata: { tags: ["music"], app: "ecency/3.0" } }));

    const { payload } = await jsonEnvelope();

    expect(payload.content.json_metadata).toEqual({ tags: ["music"], app: "ecency/3.0" });
  });

  it("does not mutate the entry held in the query cache", async () => {
    const cached = entryFixture({ json_metadata: '{"tags":["music"]}' });
    serve(cached);

    const { payload } = await jsonEnvelope();

    expect(payload.content.json_metadata).toEqual({ tags: ["music"] });
    // The cache is rendered from elsewhere in the same process.
    expect(cached.json_metadata).toBe('{"tags":["music"]}');
  });

  it("still 404s a post whose only nsfw signal is a tag inside string metadata", async () => {
    serve(entryFixture({ json_metadata: '{"tags":["nsfw","art"]}' }));

    const { res } = await jsonEnvelope();

    expect(res.status).toBe(404);
  });
});

describe("the indexability gate reads the entry as the node returned it", () => {
  beforeEach(() => vi.clearAllMocks());

  // ⛔ canonicalTarget deliberately does not parse a declared canonical_url
  // (entry-indexability.ts). Normalising before the gate instead of at the
  // response body would switch that branch on for these endpoints alone and
  // start serving posts they suppress today.
  const deepReply = {
    depth: 2,
    parent_author: "bob",
    parent_permlink: "",
    root_author: "",
    root_permlink: ""
  };

  it("suppresses a deep reply whose only canonical is declared inside string metadata", async () => {
    serve(
      entryFixture({
        ...deepReply,
        json_metadata: '{"canonical_url":"https://example.com/@alice/deep-reply"}'
      })
    );

    const { res } = await jsonEnvelope();

    expect(res.status).toBe(404);
  });

  // Observed, not desired: the declared-canonical branch fires only on the
  // parsed shape, so the same reply is visible here when the bridge fallback
  // answered and suppressed when condenser did. That asymmetry predates this
  // change and belongs to the product decision, not to these endpoints.
  it("keeps serving that reply when the node itself returned parsed metadata", async () => {
    serve(
      entryFixture({
        ...deepReply,
        json_metadata: { canonical_url: "https://example.com/@alice/deep-reply" }
      })
    );

    const { res } = await jsonEnvelope();

    expect(res.status).toBe(200);
  });
});

describe("GET /@author/permlink.discussion.json", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normalises every entry in the thread, whichever shape it arrived in", async () => {
    serve(entryFixture({ json_metadata: '{"tags":["music"]}' }), {
      discussion: {
        "alice/a-post": entryFixture({ json_metadata: '{"tags":["music"]}' }),
        "bob/re-a-post": entryFixture({
          author: "bob",
          permlink: "re-a-post",
          json_metadata: { tags: ["reply"] }
        }),
        "carol/re-a-post": entryFixture({
          author: "carol",
          permlink: "re-a-post",
          json_metadata: "not json"
        })
      }
    });

    const res = await agentDiscussion(request(".discussion.json"), { params });
    const payload = JSON.parse(await res.text());

    expect(res.status).toBe(200);
    expect(Object.keys(payload.content)).toEqual([
      "alice/a-post",
      "bob/re-a-post",
      "carol/re-a-post"
    ]);
    expect(payload.content["alice/a-post"].json_metadata).toEqual({ tags: ["music"] });
    expect(payload.content["bob/re-a-post"].json_metadata).toEqual({ tags: ["reply"] });
    expect(payload.content["carol/re-a-post"].json_metadata).toEqual({});
  });

  it("caps one entry's runaway metadata without touching the rest of the thread", async () => {
    serve(entryFixture({ json_metadata: '{"tags":["music"]}' }), {
      discussion: {
        "alice/a-post": entryFixture({ json_metadata: '{"tags":["music"]}' }),
        "bob/re-a-post": entryFixture({
          author: "bob",
          permlink: "re-a-post",
          json_metadata: metadataBomb()
        })
      }
    });

    const res = await agentDiscussion(request(".discussion.json"), { params });
    const payload = JSON.parse(await res.text());

    expect(res.status).toBe(200);
    expect(Object.keys(payload.content)).toEqual(["alice/a-post", "bob/re-a-post"]);
    // Anyone can reply to anyone, so one hostile reply must not empty the rest
    // of the thread's metadata, the root post's least of all.
    expect(payload.content["alice/a-post"].json_metadata).toEqual({ tags: ["music"] });
    expect(payload.content["bob/re-a-post"].json_metadata).toEqual({});
  });

  it("drops a map value that is not an entry instead of spreading it", async () => {
    serve(entryFixture({ json_metadata: '{"tags":["music"]}' }), {
      discussion: {
        "alice/a-post": entryFixture({ json_metadata: '{"tags":["music"]}' }),
        "bob/re-a-post": "oops",
        "carol/re-a-post": null
      }
    });

    const res = await agentDiscussion(request(".discussion.json"), { params });
    const payload = JSON.parse(await res.text());

    expect(res.status).toBe(200);
    // A string would otherwise be spread character by character, and the docs
    // promise every entry of the map carries json_metadata.
    expect(Object.keys(payload.content)).toEqual(["alice/a-post"]);
  });

  it("drops an authorless entry while keeping the rest of the thread", async () => {
    serve(entryFixture({ json_metadata: '{"tags":["music"]}' }), {
      discussion: {
        "alice/a-post": entryFixture({ json_metadata: '{"tags":["music"]}' }),
        "ghost/re-a-post": {}
      }
    });

    const res = await agentDiscussion(request(".discussion.json"), { params });
    const payload = JSON.parse(await res.text());

    expect(Object.keys(payload.content)).toEqual(["alice/a-post"]);
  });

  it("drops an array map value instead of emitting it index by index", async () => {
    serve(entryFixture({ json_metadata: '{"tags":["music"]}' }), {
      discussion: {
        "alice/a-post": entryFixture({ json_metadata: '{"tags":["music"]}' }),
        "bob/re-a-post": ["x", "y"]
      }
    });

    const res = await agentDiscussion(request(".discussion.json"), { params });
    const payload = JSON.parse(await res.text());

    expect(Object.keys(payload.content)).toEqual(["alice/a-post"]);
  });

  it.each([
    ["the thread lookup failed", undefined],
    ["the thread came back empty", {}],
    ["nothing in the thread was an entry", { "alice/a-post": null, "bob/re-a-post": "oops" }],
    // validateEntry in the SDK fills missing fields with "" rather than
    // rejecting, so an empty object reaches the route as an authorless entry.
    ["the thread held only authorless entries", { "alice/a-post": {}, "bob/re": { author: "" } }]
  ])("404s rather than serving an empty thread when %s", async (_label, discussion) => {
    // prefetchQuery resolves undefined on an RPC failure or an SSR timeout, and
    // bridge.get_discussion always includes the root post, so an empty map is a
    // failed lookup. A 200 here would pin "no comments" in the edge cache for
    // five minutes; a 404 is capped at sixty seconds.
    serve(entryFixture({ json_metadata: '{"tags":["music"]}' }), { discussion });

    const res = await agentDiscussion(request(".discussion.json"), { params });

    expect(res.status).toBe(404);
  });

  it("still 404s when the requested root is suppressed", async () => {
    serve(entryFixture({ json_metadata: '{"tags":["nsfw"]}' }), { discussion: {} });

    const res = await agentDiscussion(request(".discussion.json"), { params });

    expect(res.status).toBe(404);
  });
});

describe("GET /@author/permlink.md", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps listing tags and app from string metadata in the front matter", async () => {
    serve(entryFixture({ json_metadata: '{"app":"scrobble.life/1.0","tags":["music"]}' }));

    const res = await agentMd(request(".md"), { params });
    const markdown = await res.text();

    expect(res.status).toBe(200);
    expect(markdown).toContain('tags: ["music"]');
    expect(markdown).toContain('app: "scrobble.life/1.0"');
  });
});

describe("GET /llms.txt", () => {
  it("publishes the limits the endpoints actually apply", async () => {
    // The document and the code were two sources of truth for the same number.
    const { GET } = await import("@/app/llms.txt/route");
    const text = await (await GET()).text();

    expect(text).toContain("`content.json_metadata` is always a JSON object");
    expect(text).toContain(`nested more than ${MAX_METADATA_DEPTH} levels deep`);
    expect(text).toContain(`more than ${MAX_METADATA_NODES} values`);
  });
});

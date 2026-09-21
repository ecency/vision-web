// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The agent endpoints serve PUBLIC response bodies, so the shape of
 * `json_metadata` in them is a contract, not an implementation detail. Only
 * the data layer is mocked here: the loader, the indexability gate and the
 * envelopes all run for real.
 */

const { prefetchQuery } = vi.hoisted(() => ({ prefetchQuery: vi.fn() }));

vi.mock("@/core/react-query", () => ({ prefetchQuery }));
vi.mock("@ecency/sdk", () => ({
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

/** Metadata nested deep enough that JSON.stringify can blow the stack. */
const DEEP = 6000;
const deepMetadataString = () => `${'{"a":'.repeat(DEEP)}1${"}".repeat(DEEP)}`;
function deepMetadataObject(): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let cursor = root;
  for (let i = 0; i < DEEP; i += 1) {
    const next: Record<string, unknown> = {};
    cursor.a = next;
    cursor = next;
  }
  return root;
}

/** condenser answers first; bridge answers only when `bridge` is given. */
function serve(condenser: unknown, extra: { bridge?: unknown; discussion?: unknown } = {}) {
  prefetchQuery.mockImplementation(async (options: { queryKey: readonly unknown[] }) => {
    const [kind] = options.queryKey;
    if (kind === "condenser") return condenser;
    if (kind === "bridge") return extra.bridge ?? null;
    if (kind === "discussion") return extra.discussion ?? null;
    return [ACCOUNT];
  });
}

const params = Promise.resolve({ category: "hive-125125", author: "alice", permlink: "a-post" });

const request = (ext: string) => new Request(`https://ecency.com/@alice/a-post${ext}`);

async function jsonEnvelope() {
  const res = await agentJson(request(".json"), { params });
  return { res, payload: res.status === 200 ? JSON.parse(await res.text()) : null };
}

describe("GET /@author/permlink.json", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serves json_metadata as an object when condenser_api answered with a string", async () => {
    serve(entryFixture({ json_metadata: '{"app":"scrobble.life/1.0","tags":["music","alive"]}' }));

    const { res, payload } = await jsonEnvelope();

    expect(res.status).toBe(200);
    expect(payload.source).toBe("hive_condenser");
    expect(typeof payload.content.json_metadata).toBe("object");
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

  it("keeps serving a post whose metadata is nested too deep to serialise", async () => {
    // JSON.parse accepts deeper nesting than JSON.stringify can emit, so a
    // parsed object can blow the stack while the envelope is serialised and
    // take the whole post down with it (the route catches and 404s). The exact
    // depth where that happens is platform dependent, so this pins the
    // invariant rather than the branch: the post is served either way, and its
    // metadata is an object.
    serve(entryFixture({ json_metadata: deepMetadataString() }));

    const { res, payload } = await jsonEnvelope();

    expect(res.status).toBe(200);
    expect(payload.content.body).toBe(BODY);
    expect(typeof payload.content.json_metadata).toBe("object");
  });

  it("keeps serving it when the node itself returned the deep metadata parsed", async () => {
    // The bridge shape skips normalisation entirely, so the envelope is the
    // only place that can catch this.
    serve(entryFixture({ json_metadata: deepMetadataObject() }));

    const { res, payload } = await jsonEnvelope();

    expect(res.status).toBe(200);
    expect(payload.content.body).toBe(BODY);
    expect(typeof payload.content.json_metadata).toBe("object");
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

  it("still serves the thread when one entry's metadata is too deep to serialise", async () => {
    serve(entryFixture({ json_metadata: '{"tags":["music"]}' }), {
      discussion: {
        "alice/a-post": entryFixture({ json_metadata: '{"tags":["music"]}' }),
        "bob/re-a-post": entryFixture({
          author: "bob",
          permlink: "re-a-post",
          json_metadata: deepMetadataObject()
        })
      }
    });

    const res = await agentDiscussion(request(".discussion.json"), { params });
    const payload = JSON.parse(await res.text());

    expect(res.status).toBe(200);
    expect(Object.keys(payload.content)).toEqual(["alice/a-post", "bob/re-a-post"]);
    // Anyone can reply to anyone, so one deep reply must not empty the rest of
    // the thread's metadata, the root post's least of all.
    expect(payload.content["alice/a-post"].json_metadata).toEqual({ tags: ["music"] });
    expect(typeof payload.content["bob/re-a-post"].json_metadata).toBe("object");
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

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// loadEntry (agent endpoints) reads condenser get_content first and falls back
// to bridge.get_post. The first source must not mark the response degraded on
// its own; the fallback keeps the default, so it marks when it fails too.
//
// generateEntryMetadata reads the page's own bridge query (one lookup per
// render) and asks condenser only for a reply too deep for bridge to name its
// thread root.
const { prefetchQuery, markSsrDegraded } = vi.hoisted(() => ({
  prefetchQuery: vi.fn(),
  markSsrDegraded: vi.fn()
}));

vi.mock("@/core/react-query", () => ({ prefetchQuery, markSsrDegraded }));
vi.mock("@ecency/sdk", () => ({
  ConfigManager: { setDmcaLists: () => {} },
  getContentQueryOptions: (author: string, permlink: string) => ({
    queryKey: ["condenser", author, permlink]
  }),
  getProfilesQueryOptions: (names: string[]) => ({ queryKey: ["profiles", ...names] })
}));
vi.mock("@/core/caches", () => ({
  EcencyEntriesCacheManagement: {
    getEntryQueryByPath: (author: string, permlink: string) => ({
      queryKey: ["bridge", author, permlink]
    })
  }
}));
vi.mock("@/utils/server-app-base", () => ({
  getServerAppBase: async () => "https://ecency.com"
}));
vi.mock("@/utils", async () => {
  const dates = await vi.importActual<typeof import("@/utils/parse-date")>("@/utils/parse-date");
  const decode =
    await vi.importActual<typeof import("@/utils/safe-decode-uri")>("@/utils/safe-decode-uri");
  const truncate = await vi.importActual<typeof import("@/utils/truncate")>("@/utils/truncate");
  return {
    parseDate: dates.parseDate,
    safeDecodeURIComponent: decode.safeDecodeURIComponent,
    truncate: truncate.truncate
  };
});

import { generateEntryMetadata } from "@/app/(dynamicPages)/entry/_helpers/generate-entry-metadata";
import { loadEntry } from "@/app/(dynamicPages)/entry/_helpers/agent-readable";

const post = (author: string, permlink: string, thread: Record<string, unknown> = {}) => ({
  author,
  permlink,
  title: "A post",
  body: "A body comfortably past the thin-content floor. ".repeat(6),
  category: "hive-125125",
  created: "2026-01-01T00:00:00",
  json_metadata: {},
  author_reputation: 70,
  stats: {},
  depth: 0,
  ...thread
});

// bridge.get_post shapes: no root_* at all.
const ROOT_POST = { depth: 0 };
const DEPTH1_REPLY = { depth: 1, parent_author: "bob", parent_permlink: "the-post" };
const DEPTH2_REPLY = { depth: 2, parent_author: "carol", parent_permlink: "re-the-post" };

// The condenser source failed (the helper resolves undefined); bridge answers.
const serveFromBridgeOnly = (thread: Record<string, unknown> = ROOT_POST) =>
  prefetchQuery.mockImplementation(async (options: { queryKey: readonly unknown[] }) => {
    const [kind, author, permlink] = options.queryKey as string[];
    if (kind === "condenser") return undefined;
    if (kind === "bridge") return post(author, permlink, thread);
    return [{ name: author, reputation: 70, post_count: 120 }];
  });

// condenser answers with the full thread fields.
const serveFromCondenser = () =>
  prefetchQuery.mockImplementation(async (options: { queryKey: readonly unknown[] }) => {
    const [kind, author, permlink] = options.queryKey as string[];
    if (kind === "condenser") {
      return post(author, permlink, {
        ...DEPTH2_REPLY,
        root_author: "bob",
        root_permlink: "the-post"
      });
    }
    if (kind === "bridge") throw new Error("bridge must not be asked");
    return [{ name: author, reputation: 70, post_count: 120 }];
  });

const LOADERS = [["loadEntry", () => loadEntry("alice", "a-post")]] as const;

const callFor = (kind: string) =>
  prefetchQuery.mock.calls.find(
    ([options]) => (options as { queryKey: string[] }).queryKey[0] === kind
  );

describe("entry loaders with a condenser -> bridge fallback", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(LOADERS)(
    "%s opts the condenser source out of marking and keeps it on the fallback",
    async (_, run) => {
      serveFromBridgeOnly();
      await run();
      expect(callFor("condenser")?.[1]).toEqual({ degradeOnFailure: false });
      expect(callFor("bridge")).toBeDefined();
      expect(callFor("bridge")?.[1]).toBeUndefined();
    }
  );

  it.each(LOADERS)(
    "%s marks a bridge-served deep reply whose thread root is lost",
    async (_, run) => {
      serveFromBridgeOnly(DEPTH2_REPLY);
      await run();
      expect(markSsrDegraded).toHaveBeenCalledTimes(1);
      expect(markSsrDegraded).toHaveBeenCalledWith("fallback-incomplete");
    }
  );

  it.each(LOADERS)("%s keeps a bridge-served root post cacheable", async (_, run) => {
    serveFromBridgeOnly(ROOT_POST);
    await run();
    expect(markSsrDegraded).not.toHaveBeenCalled();
  });

  it.each(LOADERS)(
    "%s keeps a bridge-served depth-1 reply cacheable (its parent is the root)",
    async (_, run) => {
      serveFromBridgeOnly(DEPTH1_REPLY);
      await run();
      expect(markSsrDegraded).not.toHaveBeenCalled();
    }
  );

  it.each(LOADERS)("%s does not mark a deep reply served by condenser", async (_, run) => {
    serveFromCondenser();
    await run();
    expect(callFor("bridge")).toBeUndefined();
    expect(markSsrDegraded).not.toHaveBeenCalled();
  });
});

// bridge answers with `thread`; condenser answers `content` (undefined = failed).
const serveBridgeFirst = (thread: Record<string, unknown>, content?: Record<string, unknown>) =>
  prefetchQuery.mockImplementation(async (options: { queryKey: readonly unknown[] }) => {
    const [kind, author, permlink] = options.queryKey as string[];
    if (kind === "bridge") return post(author, permlink, thread);
    if (kind === "condenser") return content && post(author, permlink, { ...thread, ...content });
    return [{ name: author, reputation: 70, post_count: 120 }];
  });

describe("generateEntryMetadata reads the page's bridge query", () => {
  beforeEach(() => vi.clearAllMocks());
  const run = () => generateEntryMetadata("alice", "a-post");

  it.each([
    ["a root post", ROOT_POST],
    ["a depth-1 reply", DEPTH1_REPLY]
  ])("reads only bridge and the profile for %s, and stays cacheable", async (_, thread) => {
    serveBridgeFirst(thread);
    const meta = await run();
    expect(callFor("bridge")).toBeDefined();
    // The page's own call: default marking, so a failed read is marked.
    expect(callFor("bridge")?.[1]).toBeUndefined();
    expect(callFor("condenser")).toBeUndefined();
    expect(markSsrDegraded).not.toHaveBeenCalled();
    expect(meta.title).toBeDefined();
  });

  it("asks for the profile by the URL author, without waiting for the post", async () => {
    let releaseBridge: () => void = () => {};
    prefetchQuery.mockImplementation(async (options: { queryKey: readonly unknown[] }) => {
      const [kind, author, permlink] = options.queryKey as string[];
      if (kind === "bridge") {
        await new Promise<void>((resolve) => (releaseBridge = resolve));
        return post(author, permlink, ROOT_POST);
      }
      return [{ name: author, reputation: 70, post_count: 120 }];
    });
    const pending = run();
    await Promise.resolve();
    expect(callFor("profiles")?.[0]).toEqual({ queryKey: ["profiles", "alice"] });
    releaseBridge();
    await pending;
  });

  it("completes a deep reply's thread root from condenser, opted out of marking", async () => {
    serveBridgeFirst(DEPTH2_REPLY, { root_author: "bob", root_permlink: "the-post" });
    const meta = await run();
    expect(callFor("condenser")?.[1]).toEqual({ degradeOnFailure: false });
    expect(markSsrDegraded).not.toHaveBeenCalled();
    expect(meta.alternates?.canonical).toBe("https://ecency.com/@bob/the-post");
  });

  it("marks a deep reply whose thread root stays unknown", async () => {
    serveBridgeFirst(DEPTH2_REPLY);
    await run();
    expect(markSsrDegraded).toHaveBeenCalledTimes(1);
    expect(markSsrDegraded).toHaveBeenCalledWith("fallback-incomplete");
  });

  it("keeps its own canonical when the post declares a third-party one", async () => {
    // bridge hands json_metadata over parsed; the page must not hand
    // rel=canonical or og:url to another frontend (canonicalTarget's ⛔ note).
    serveBridgeFirst({ ...ROOT_POST, json_metadata: { canonical_url: "https://elsewhere.example/@alice/a-post" } });
    const meta = await run();
    expect(meta.alternates?.canonical).toBe("https://ecency.com/@alice/a-post");
    expect((meta.openGraph as { url?: string } | undefined)?.url).toBe("https://ecency.com/@alice/a-post");
  });

  it("reads the post by the decoded permlink, so an encoded URL still resolves", async () => {
    serveBridgeFirst(ROOT_POST);
    const meta = await generateEntryMetadata("alice", "%61-post");
    expect((callFor("bridge")?.[0] as { queryKey: string[] }).queryKey).toEqual(["bridge", "alice", "a-post"]);
    expect(meta.title).toBeDefined();
  });

  it("returns no metadata when the post cannot be read", async () => {
    prefetchQuery.mockImplementation(async (options: { queryKey: readonly unknown[] }) =>
      (options.queryKey as string[])[0] === "profiles" ? [] : undefined
    );
    expect(await run()).toEqual({});
    expect(callFor("condenser")).toBeUndefined();
  });
});

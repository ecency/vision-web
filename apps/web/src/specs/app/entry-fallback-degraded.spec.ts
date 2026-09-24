// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Both entry loaders read condenser get_content first and fall back to
// bridge.get_post. The first source must not mark the response degraded on
// its own; the fallback keeps the default, so it marks when it fails too.
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

const LOADERS = [
  ["generateEntryMetadata", () => generateEntryMetadata("alice", "a-post")],
  ["loadEntry", () => loadEntry("alice", "a-post")]
] as const;

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

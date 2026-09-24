// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Both entry loaders read condenser get_content first and fall back to
// bridge.get_post. The first source must not mark the response degraded on
// its own; the fallback keeps the default, so it marks when it fails too.
const { prefetchQuery } = vi.hoisted(() => ({ prefetchQuery: vi.fn() }));

vi.mock("@/core/react-query", () => ({ prefetchQuery }));
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

// The condenser source failed (the helper resolves undefined); bridge answers.
const serveFromBridgeOnly = () =>
  prefetchQuery.mockImplementation(async (options: { queryKey: readonly unknown[] }) => {
    const [kind, author, permlink] = options.queryKey as string[];
    if (kind === "condenser") return undefined;
    if (kind === "bridge") {
      return {
        author,
        permlink,
        title: "A post",
        body: "A body comfortably past the thin-content floor. ".repeat(6),
        category: "hive-125125",
        created: "2026-01-01T00:00:00",
        json_metadata: {},
        author_reputation: 70,
        stats: {}
      };
    }
    return [{ name: author, reputation: 70, post_count: 120 }];
  });

const callFor = (kind: string) =>
  prefetchQuery.mock.calls.find(
    ([options]) => (options as { queryKey: string[] }).queryKey[0] === kind
  );

describe("entry loaders with a condenser -> bridge fallback", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["generateEntryMetadata", () => generateEntryMetadata("alice", "a-post")],
    ["loadEntry", () => loadEntry("alice", "a-post")]
  ])("%s opts the condenser source out of marking and keeps it on the fallback", async (_, run) => {
    serveFromBridgeOnly();
    await run();
    expect(callFor("condenser")?.[1]).toEqual({ degradeOnFailure: false });
    expect(callFor("bridge")).toBeDefined();
    expect(callFor("bridge")?.[1]).toBeUndefined();
  });
});

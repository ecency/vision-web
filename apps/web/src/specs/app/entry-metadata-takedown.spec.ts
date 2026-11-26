// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { prefetchQuery } = vi.hoisted(() => ({ prefetchQuery: vi.fn() }));

vi.mock("@/core/react-query", () => ({ prefetchQuery }));
vi.mock("@ecency/sdk", () => ({
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
  const decode = await vi.importActual<typeof import("@/utils/safe-decode-uri")>(
    "@/utils/safe-decode-uri"
  );
  const truncate = await vi.importActual<typeof import("@/utils/truncate")>("@/utils/truncate");
  return {
    parseDate: dates.parseDate,
    safeDecodeURIComponent: decode.safeDecodeURIComponent,
    truncate: truncate.truncate
  };
});

import { generateEntryMetadata } from "@/app/(dynamicPages)/entry/_helpers/generate-entry-metadata";

const BODY = "A body comfortably past the thin-content floor. ".repeat(6);

const entry = (author: string, permlink: string) => ({
  author,
  permlink,
  title: "A post",
  body: BODY,
  category: "hive-125125",
  created: "2026-01-01T00:00:00",
  updated: "2026-01-01T00:00:00",
  author_reputation: 70,
  json_metadata: { tags: ["photography"] },
  children: 0,
  depth: 0,
  stats: { flag_weight: 0, gray: false, hide: false, total_votes: 3 }
});

const serve = (author: string, permlink: string) =>
  prefetchQuery.mockImplementation(async (options: { queryKey: readonly unknown[] }) => {
    const [kind] = options.queryKey;
    if (kind === "condenser") return entry(author, permlink);
    if (kind === "bridge") return null;
    return [{ name: author, reputation: 70, post_count: 120 }];
  });

describe("generateEntryMetadata and takedowns", () => {
  beforeEach(() => vi.clearAllMocks());

  it("noindexes a taken-down post", async () => {
    // This reads getContentQueryOptions, which the filter now censors: the
    // metadata is blanked and the body replaced with the notice, which removes
    // the NSFW tag and lifts the post over the thin-content floor. Without a
    // takedown check ahead of the gate a listed post becomes indexable and
    // advertises its oEmbed endpoint (#1862).
    serve("boombaam1", "coinbase-customer-service-1-8o8-e007d0f9ebe");

    const meta = await generateEntryMetadata("boombaam1", "coinbase-customer-service-1-8o8-e007d0f9ebe");

    expect(meta.robots).toBe("noindex, nofollow");
    expect(meta.alternates?.types).toBeUndefined();
  });

  it("leaves an ordinary post indexable", async () => {
    serve("someoneelse", "a-fine-post");

    const meta = await generateEntryMetadata("someoneelse", "a-fine-post");

    expect(meta.robots).toBeUndefined();
  });
});

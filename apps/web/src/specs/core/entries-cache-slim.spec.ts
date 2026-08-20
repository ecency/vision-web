import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

// The global mocks do not carry getPostQueryOptions or makeEntryPath, which
// entries-cache uses to build the shared key. See CLAUDE.md on partial mocks.
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<object>("@ecency/sdk"))
}));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<object>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));
import { EcencyEntriesCacheManagement } from "@/core/caches";
import type { Entry } from "@/entities";

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    author: "alice",
    permlink: "a-post",
    title: "A title",
    body: "the full article body",
    json_metadata: { description: "card summary" },
    active_votes: [],
    stats: { total_votes: 0, flag_weight: 0, gray: false, hide: false },
    ...overrides
  } as Entry;
}

/**
 * Feed cards seed the shared post cache with a SLIM row so their vote, payout and
 * reblog controls read one entry. Anything else that later asks for the same post
 * with a full entry in hand — the decks post viewer is the real case — must not be
 * handed the slim body back.
 */
describe("shared entry cache with slim rows", () => {
  it("does not let a cached slim row blank a full entry's body", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const slim = entry({ body: "", slim: { ext_link: false } });
    const full = entry();

    // A feed card seeds the key first.
    const seed = EcencyEntriesCacheManagement.getEntryQuery(slim);
    qc.setQueryData(seed.queryKey, slim);

    // Then a consumer that already holds the whole post reads the same key.
    const options = EcencyEntriesCacheManagement.getEntryQuery(full);
    const observer = new QueryObserver(qc, { ...options, enabled: false } as never);
    const result = observer.getCurrentResult().data as Entry | undefined;

    expect(result?.body).toBe("the full article body");
    observer.destroy();
  });

  it("still lets a refetched entry win over the value it was seeded with", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const initial = entry({ title: "stale title" });
    const options = EcencyEntriesCacheManagement.getEntryQuery(initial);
    qc.setQueryData(options.queryKey, entry({ title: "fresh title" }));

    const observer = new QueryObserver(qc, { ...options, enabled: false } as never);
    expect((observer.getCurrentResult().data as Entry).title).toBe("fresh title");
    observer.destroy();
  });
});

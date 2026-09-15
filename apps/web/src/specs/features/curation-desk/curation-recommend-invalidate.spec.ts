import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@ecency/sdk", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")) }));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  ensureValidToken: vi.fn(async () => "code-1"),
}));
vi.mock("@/core/hooks/use-active-username", () => ({ useActiveUsername: () => "curator1" }));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: { username: "curator1" }, account: null, isLoading: false }),
}));
vi.mock("@/core/global-store", () => ({
  useGlobalStore: (selector: (s: unknown) => unknown) => selector({ activeUser: { username: "curator1" } }),
}));

import { QueryKeys } from "@ecency/sdk";
import { invalidateRecommendationFeeds } from "@/features/curation-desk/curation-recommend-flow";

/**
 * A recommendation made or withdrawn changes which posts the recommendation
 * feeds hold. The curators' recommendations tab reads a roster feed, so it has
 * to refetch with the public list, while the queue keeps its pages.
 */
describe("invalidateRecommendationFeeds", () => {
  it("refetches every recommendation feed and leaves the other roster feeds alone", () => {
    const client = new QueryClient();
    const keys = {
      publicList: QueryKeys.curation.recommendations({ sort: "unique" }),
      recommendedView: QueryKeys.curation.rosterFeed("curator1", { view: "recommended", sort: "newest" }),
      recommendedChip: QueryKeys.curation.rosterFeed("curator1", { recommended: "true" }),
      uniqueSort: QueryKeys.curation.rosterFeed("curator1", { sort: "unique" }),
      queue: QueryKeys.curation.rosterFeed("curator1", { sort: "queue" }),
      otherCurator: QueryKeys.curation.rosterFeed("curator2", { view: "recommended" }),
    };
    for (const key of Object.values(keys)) client.setQueryData(key, { pages: [], pageParams: [] });

    invalidateRecommendationFeeds(client, "curator1");

    const invalidated = (key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated;
    expect(invalidated(keys.publicList)).toBe(true);
    expect(invalidated(keys.recommendedView)).toBe(true);
    expect(invalidated(keys.recommendedChip)).toBe(true);
    expect(invalidated(keys.uniqueSort)).toBe(true);
    expect(invalidated(keys.queue)).toBe(false);
    // Another account's cache belongs to another session on this browser.
    expect(invalidated(keys.otherCurator)).toBe(false);
  });
});

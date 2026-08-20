import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useCommunityPinCache } from "@/core/caches";
import { createTestQueryClient } from "@/specs/test-utils";
import type { Entry } from "@/entities";

const rankedOptions = vi.fn();
vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@ecency/sdk");
  return {
    ...actual,
    getPostsRankedQueryOptions: (...args: unknown[]) => {
      rankedOptions(...args);
      return {
        queryKey: ["posts", "ranked-page", ...args.slice(0, 5)],
        queryFn: async () => [],
        enabled: args[6]
      };
    }
  };
});
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<object>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

const entry = { author: "alice", permlink: "a-post", category: "hive-125125", post_id: 1, stats: { is_pinned: false } } as unknown as Entry;

function render(canPin: boolean) {
  rankedOptions.mockClear();
  const client = createTestQueryClient();
  renderHook(() => useCommunityPinCache(entry, canPin), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  });
  // the 7th argument of getPostsRankedQueryOptions is `enabled`
  return rankedOptions.mock.calls[0]?.[6];
}

/**
 * Resolving pin state costs a full community page, because the bridge does not
 * report `stats.is_pinned` on feed rows. Every card in a community feed mounts
 * this menu, so an ungated fetch multiplied that across the whole page.
 */
describe("useCommunityPinCache", () => {
  it("does not fetch a community page for a viewer who cannot pin", () => {
    expect(render(false)).toBe(false);
  });

  it("still fetches for a moderator, who is offered Pin and Unpin", () => {
    expect(render(true)).toBe(true);
  });
});

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useCommunityPinCache } from "@/core/caches";
import { QueryIdentifiers } from "@/core/react-query";
import type { Entry } from "@/entities";

const rankedOptions = vi.fn();
const PINNED_ROW = { author: "alice", permlink: "a-post", stats: { is_pinned: true } };

vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@ecency/sdk");
  return {
    ...actual,
    getPostsRankedQueryOptions: (...args: unknown[]) => {
      rankedOptions(...args);
      return {
        queryKey: ["posts", "ranked-page", ...args.slice(0, 5)],
        queryFn: async () => [PINNED_ROW],
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

const entry = {
  author: "alice",
  permlink: "a-post",
  category: "hive-125125",
  post_id: 1,
  stats: {}
} as unknown as Entry;

const RANKED_KEY = ["posts", "ranked-page", "created", "", "", 20, "hive-125125"];

// The app's real defaults. They are the reason this hook behaved the way it did:
// an initialData query under them never runs its queryFn.
function appClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, refetchOnMount: false, retry: false } }
  });
}

function render(canPin: boolean, client = appClient()) {
  rankedOptions.mockClear();
  const view = renderHook(({ can }: { can: boolean }) => useCommunityPinCache(entry, can), {
    initialProps: { can: canPin },
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  });
  return { ...view, client };
}

describe("useCommunityPinCache", () => {
  it("does not fetch a community page for a viewer who cannot pin", () => {
    render(false);
    // the 7th argument of getPostsRankedQueryOptions is `enabled`
    expect(rankedOptions.mock.calls[0]?.[6]).toBe(false);
  });

  it("still fetches for a moderator, who is offered Pin and Unpin", () => {
    render(true);
    expect(rankedOptions.mock.calls[0]?.[6]).toBe(true);
  });

  it("reports the post as pinned once the community page says so", async () => {
    // The bridge does not set stats.is_pinned on feed rows, so the community
    // page is the only source. This is what used to be fetched and then ignored.
    const { result } = render(true);
    await waitFor(() => expect(result.current.data).toBe(true));
  });

  it("picks up pin state when moderator permission resolves after mount", async () => {
    // community and team data load asynchronously, so canPin commonly flips
    // false -> true under an unchanged post id.
    const client = appClient();
    const { result, rerender } = render(false, client);
    expect(result.current.data).toBe(false);

    rerender({ can: true });

    await waitFor(() => expect(client.getQueryData(RANKED_KEY)).toBeTruthy());
    await waitFor(() => expect(result.current.data).toBe(true));
  });

  it("lets a pin or unpin override what the community page said", async () => {
    const client = appClient();
    const { result } = render(true, client);
    await waitFor(() => expect(result.current.data).toBe(true));

    // useCommunityPin writes this key on success; unpinning must win over the
    // community page still listing the post as pinned.
    client.setQueryData([QueryIdentifiers.ENTRY_PIN_TRACK, entry.post_id], false);
    await waitFor(() => expect(result.current.data).toBe(false));
  });
});

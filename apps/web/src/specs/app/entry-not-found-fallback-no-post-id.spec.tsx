import React from "react";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { getPostQueryOptions } from "@ecency/sdk";
import { renderWithQueryClient } from "@/specs/test-utils";
import { EntryNotFoundFallback } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-not-found-fallback";

// A post the server render missed is polled from the chain and, once found,
// the page refreshes into it. "Found" was `post_id > 1`, and Hive API nodes no
// longer return post_id, so a live post was never picked up and the page fell
// through to the deleted-post screen.

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() })
}));

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils/make-path")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

vi.mock("@/core/caches", () => ({
  EcencyEntriesCacheManagement: { updateEntryQueryData: vi.fn() }
}));

vi.mock(
  "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/deleted-post-screen",
  () => ({ DeletedPostScreen: () => <div>deleted-post-screen</div> })
);
vi.mock(
  "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-pending-index-view",
  () => ({ EntryPendingIndexView: () => <div>pending</div> })
);

describe("EntryNotFoundFallback with a chain entry that has no post_id", () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.mocked(getPostQueryOptions).mockImplementation(
      (author: string, permlink?: string) =>
        ({
          queryKey: ["posts", "content", author, permlink],
          // What bridge.get_post returns now: the post, without post_id.
          queryFn: async () => ({ author, permlink, body: "live", created: "2026-11-14T06:40:00" })
        }) as unknown as ReturnType<typeof getPostQueryOptions>
    );
  });

  it("switches to the live post instead of verifying it as deleted", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderWithQueryClient(<EntryNotFoundFallback username="alice" permlink="live-post" />, {
      queryClient
    });

    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});

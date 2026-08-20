import React from "react";
import { render, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Entry } from "@/entities";

const fetchSpy = vi.hoisted(() => vi.fn(async () => [] as Entry[]));

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
  getPostsRankedQueryOptions: vi.fn(() => ({
    queryKey: ["posts", "ranked-page", "poll"],
    queryFn: fetchSpy
  }))
}));
vi.mock("@/api/queries", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/api/queries")),
  usePostsFeedQuery: () => ({ data: undefined, isFetching: false })
}));
vi.mock("@/features/shared/entry-list-content", () => ({ EntryListContent: () => null }));
vi.mock("@/features/shared/linear-progress", () => ({ LinearProgress: () => null }));
vi.mock("@/features/shared/user-avatar", () => ({ UserAvatar: () => null }));

import { FeedLayout } from "@/app/(dynamicPages)/feed/_components/feed-layout";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

function renderFeed() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } }
  });
  return render(
    <QueryClientProvider client={client}>
      <FeedLayout tag="" filter="trending" observer="ecency">
        <div />
      </FeedLayout>
    </QueryClientProvider>
  );
}

/**
 * The poll fetches a full 20-post ranked page, 257 KB gzipped on /trending, and
 * it runs for anonymous readers too. A background tab has nobody to show the
 * "new posts" chip to, so it should not be paying for one.
 */
describe("feed poll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchSpy.mockClear();
    setVisibility("visible");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("polls while the tab is visible", async () => {
    renderFeed();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("does not poll while the tab is hidden", async () => {
    renderFeed();
    setVisibility("hidden");
    fetchSpy.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("catches up as soon as the reader comes back", async () => {
    renderFeed();
    setVisibility("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    fetchSpy.mockClear();

    await act(async () => {
      setVisibility("visible");
      await vi.advanceTimersByTimeAsync(0);
    });

    // No waiting out the rest of an interval for a chip that is already stale.
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("stops listening once the feed unmounts", async () => {
    const { unmount } = renderFeed();
    unmount();
    fetchSpy.mockClear();

    await act(async () => {
      setVisibility("visible");
      await vi.advanceTimersByTimeAsync(2 * 60_000);
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

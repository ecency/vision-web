import React from "react";
import { act, type RenderResult } from "@testing-library/react";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { getQueryClient } from "@/core/react-query";
import { renderWithQueryClient } from "@/specs/test-utils";
import type { Entry } from "@/entities";

const fetchSpy = vi.hoisted(() => vi.fn(async () => [] as Entry[]));

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));
vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@ecency/sdk");
  const { QueryKeys } = actual as { QueryKeys: typeof import("@ecency/sdk").QueryKeys };
  return {
    ...actual,
    getPostsRankedQueryOptions: vi.fn(
      (sort: string, a: string, p: string, limit: number, tag: string, observer: string) => ({
        queryKey: QueryKeys.posts.postsRankedPage(sort, a, p, limit, tag, observer),
        queryFn: fetchSpy
      })
    )
  };
});
vi.mock("@/api/queries", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/api/queries")),
  usePostsFeedQuery: () => ({ data: undefined, isFetching: false })
}));
vi.mock("@/features/shared/entry-list-content", () => ({ EntryListContent: () => null }));
vi.mock("@/features/shared/linear-progress", () => ({ LinearProgress: () => null }));
vi.mock("@/features/shared/user-avatar", () => ({ UserAvatar: () => null }));

import { FeedLayout } from "@/app/(dynamicPages)/feed/_components/feed-layout";

const ORIGINAL_VISIBILITY = Object.getOwnPropertyDescriptor(
  Document.prototype,
  "visibilityState"
);

function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

function restoreVisibility(): void {
  // The property is defined on Document.prototype, not on the instance, so the
  // test-defined own property has to be deleted or it leaks into later suites.
  delete (document as unknown as Record<string, unknown>).visibilityState;
  if (ORIGINAL_VISIBILITY) {
    Object.defineProperty(Document.prototype, "visibilityState", ORIGINAL_VISIBILITY);
  }
}

function renderFeed(): RenderResult {
  return renderWithQueryClient(
    <FeedLayout tag="" filter="trending" observer="ecency">
      <div />
    </FeedLayout>,
    {
      queryClient: new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } }
      })
    }
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
    // FeedLayout polls through getQueryClient(), the module-level client, not
    // the one the provider holds. Its cache outlives a test, and with the poll's
    // staleTime a leftover entry would satisfy the next test's fetch and make
    // these assertions depend on execution order.
    getQueryClient().clear();
    setVisibility("visible");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    getQueryClient().clear();
    restoreVisibility();
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

  it("does not touch state from a poll still in flight at unmount", async () => {
    // clearInterval stops the next tick but not one already awaiting fetchQuery.
    // Watching for a React warning proves nothing here: React 18 removed the
    // set-state-after-unmount warning, so the assertion has to be on the work
    // itself. setQueryData is the poll's first write after the await.
    let release: (v: Entry[]) => void = () => {};
    fetchSpy.mockImplementationOnce(
      () => new Promise<Entry[]>((resolve) => { release = resolve; })
    );
    const writes = vi.spyOn(getQueryClient(), "setQueryData");

    const { unmount } = renderFeed();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    unmount();
    writes.mockClear();

    await act(async () => {
      release([{ author: "alice", permlink: "p", stats: {} } as unknown as Entry]);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(writes).not.toHaveBeenCalled();
    writes.mockRestore();
  });

  it("does not refetch on return when the last poll is still fresh", async () => {
    // Deliberate: the catch-up asks for fresh data, it does not force a request.
    // A reader alt-tabbing every few seconds would otherwise pull a 257 KB page
    // per switch, which is more traffic than this change removes.
    renderFeed();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    await act(async () => {
      setVisibility("visible");
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does refetch on return once the last poll has gone stale", async () => {
    renderFeed();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    await act(async () => {
      setVisibility("visible");
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchSpy.mock.calls.length).toBeGreaterThan(1);
  });
});

import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QueryKeys } from "@ecency/sdk";

/**
 * What the waves views send as `observer`.
 *
 * The parameter carries the *viewer's* mute list, and esync treats any request
 * that has one as personalised, skipping its shared response cache. Logged out
 * there is no viewer, so it must be absent: a fallback there costs every
 * anonymous visitor a cache entry nobody else can reuse, and filters nothing
 * that esync does not already filter server-side.
 *
 * Logged in it must still be the viewer's own name, or their personal mutes
 * stop being applied at all.
 */

const getWavesFeedQueryOptions = vi.hoisted(() => vi.fn());
const getShortsFeedQueryOptions = vi.hoisted(() => vi.fn());

/**
 * Keys come from `QueryKeys` rather than a literal, so a mocked feed lands on
 * the same cache entry production would give it. That matters here: the key
 * carries the observer, so anonymous and logged-in renders are distinct
 * entries, exactly as they are in the app. A literal would collapse them onto
 * one and quietly hide a cache-sharing bug from any later test that seeds or
 * asserts on cache state.
 */
const stubInfiniteQuery = (queryKey: readonly unknown[]) => ({
  queryKey,
  initialPageParam: undefined,
  queryFn: async () => [],
  getNextPageParam: () => undefined,
  enabled: false
});

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
  getWavesFeedQueryOptions: getWavesFeedQueryOptions.mockImplementation(
    (params: Parameters<typeof QueryKeys.posts.wavesFeed>[0] = {}) =>
      stubInfiniteQuery(QueryKeys.posts.wavesFeed(params))
  ),
  getShortsFeedQueryOptions: getShortsFeedQueryOptions.mockImplementation(
    (params: Parameters<typeof QueryKeys.posts.shortsFeed>[0] = {}) =>
      stubInfiniteQuery(QueryKeys.posts.shortsFeed(params))
  ),
  getPromotedPostsQuery: vi.fn((type: string = "feed") => ({
    queryKey: QueryKeys.posts.promoted(type),
    queryFn: async () => [],
    enabled: false
  }))
}));

vi.mock("@/app/waves/_context", () => ({
  useWavesTagFilter: () => ({ selectedTag: null, selectedSource: null })
}));
vi.mock("@/app/waves/_hooks", () => ({
  useWavesAutoRefresh: () => ({ newWaves: [], clear: vi.fn(), now: 0 })
}));
vi.mock("@/app/waves/_components", () => ({ WavesRefreshPopup: () => null }));
vi.mock("@/app/waves/_components/waves-list-item", () => ({ WavesListItem: () => null }));
vi.mock("@/app/waves/_components/waves-list-loader", () => ({ WavesListLoader: () => null }));
vi.mock("@/app/waves/_components/waves-reel-item", () => ({ WavesReelItem: () => null }));
vi.mock("@/app/waves/_components/waves-fast-reply-dialog", () => ({
  WavesFastReplyDialog: () => null
}));
vi.mock("@/features/shared", () => ({ DetectBottom: () => null }));
vi.mock("@/core/hooks", () => ({ useBottomPagination: () => [vi.fn(), vi.fn()] }));

import { WavesListView } from "@/app/waves/_components/waves-list-view";
import { WavesReelsView } from "@/app/waves/_components/waves-reels-view";

function renderView(node: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

describe("waves observer", () => {
  beforeEach(() => {
    getWavesFeedQueryOptions.mockClear();
    getShortsFeedQueryOptions.mockClear();
  });

  it("omits the observer on the anonymous waves feed", () => {
    renderView(<WavesListView feedType="for-you" />);

    expect(getWavesFeedQueryOptions).toHaveBeenCalled();
    for (const [params] of getWavesFeedQueryOptions.mock.calls) {
      expect(params.observer).toBeUndefined();
    }
  });

  it("sends the logged-in viewer as the observer on the waves feed", () => {
    renderView(<WavesListView feedType="for-you" username="viewer" />);

    expect(getWavesFeedQueryOptions).toHaveBeenCalled();
    for (const [params] of getWavesFeedQueryOptions.mock.calls) {
      expect(params.observer).toBe("viewer");
    }
  });

  it("omits the observer on the anonymous shorts feed", () => {
    renderView(<WavesReelsView />);

    expect(getShortsFeedQueryOptions).toHaveBeenCalled();
    for (const [params] of getShortsFeedQueryOptions.mock.calls) {
      expect(params.observer).toBeUndefined();
    }
  });

  it("sends the logged-in viewer as the observer on the shorts feed", () => {
    renderView(<WavesReelsView username="viewer" />);

    expect(getShortsFeedQueryOptions).toHaveBeenCalled();
    for (const [params] of getShortsFeedQueryOptions.mock.calls) {
      expect(params.observer).toBe("viewer");
    }
  });

  it("puts the anonymous and logged-in feeds on different cache keys", () => {
    // The whole point of dropping the observer is the cache tier, so the key
    // has to actually differ. Also guards the mocks above: if they went back to
    // a literal key, the two renders would share one entry and every
    // cache-sensitive test written after this would be testing a fiction.
    renderView(<WavesListView feedType="for-you" />);
    const anonymous = getWavesFeedQueryOptions.mock.results[0].value.queryKey;

    getWavesFeedQueryOptions.mockClear();
    renderView(<WavesListView feedType="for-you" username="viewer" />);
    const signedIn = getWavesFeedQueryOptions.mock.results[0].value.queryKey;

    expect(anonymous).not.toEqual(signedIn);
    expect(signedIn).toContain("viewer");
  });

  it("never substitutes Ecency's moderation account for a missing viewer", () => {
    // The regression this guards: `username || DEFAULT_OBSERVER` reads as a
    // harmless default, and the response is identical either way, so nothing
    // visible breaks when it comes back -- only the cache tier changes.
    renderView(<WavesListView feedType="for-you" />);
    renderView(<WavesReelsView />);

    const observers = [
      ...getWavesFeedQueryOptions.mock.calls,
      ...getShortsFeedQueryOptions.mock.calls
    ].map(([params]) => params.observer);

    expect(observers.length).toBeGreaterThan(0);
    expect(observers).not.toContain("ecency");
  });
});

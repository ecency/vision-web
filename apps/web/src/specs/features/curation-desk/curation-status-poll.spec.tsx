import React from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurationFeedPage, CurationRosterFeedPage } from "@ecency/sdk";
import { installFetchRouter, makeFeedPage, makeRosterPage, makeRow, makeStatus } from "./curation-test-utils";

/** The poll reads both feeds through the same key, so the specs do too. */
type AnyFeedPage = CurationFeedPage | CurationRosterFeedPage;

vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
}));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  ensureValidToken: vi.fn(async () => "code-1"),
}));
vi.mock("@/core/hooks/use-active-username", () => ({ useActiveUsername: () => "member1" }));

import { useStatusPoll } from "@/features/curation-desk/hooks";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Drains the await chain of one poll: status, then page one, then the install. */
async function flush(rounds = 12) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function poll() {
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await flush();
}

/**
 * The public head refresh. Every case here is a queue that already sits in the
 * cache: the poll decides whether to replace it, never what it contains.
 */
describe("useStatusPoll", () => {
  const feedKey = ["curation", "feed", { sort: "newest" }];
  const otherFeedKey = ["curation", "feed", { sort: "queue" }];
  let router: ReturnType<typeof installFetchRouter>;
  let queryClient: QueryClient;
  let statusBody = makeStatus();

  function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  function seed(key: unknown[], pages: AnyFeedPage[]) {
    queryClient.setQueryData<InfiniteData<AnyFeedPage>>(key, {
      pages,
      pageParams: pages.map((_, index) => (index === 0 ? undefined : `c${index}`)),
    });
  }

  function loaded(key: unknown[]) {
    return queryClient.getQueryData<InfiniteData<AnyFeedPage>>(key)!;
  }

  beforeEach(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    statusBody = makeStatus();
    router = installFetchRouter().on(/curation-desk\/status/, () => statusBody);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("takes the baseline from the loaded page, so a head that moved before the first poll refreshes", async () => {
    seed(feedKey, [makeFeedPage([makeRow({ post_id: 1 })], { feed_version: "v1" })]);
    // The head moved between the page load and this first poll.
    statusBody = makeStatus({ feed_version: "v2", latest_post_id: 9 });
    const fetchPageOne = vi.fn(async () => makeFeedPage([makeRow({ post_id: 9 })], { feed_version: "v2" }));

    renderHook(() => useStatusPoll({ enabled: true, feedKey, fetchPageOne, feedVersion: "v1" }), { wrapper });
    await poll();

    expect(fetchPageOne).toHaveBeenCalledTimes(1);
    expect(loaded(feedKey).pages[0].items[0].post_id).toBe(9);
  });

  // A roster page carries no feed_version, so the version path has nothing to
  // compare and the head id is the only signal the poll gets.
  it("refreshes a roster page one that the status head has passed, then records the baseline", async () => {
    seed(feedKey, [makeRosterPage([makeRow({ post_id: 4 }), makeRow({ post_id: 3 })])]);
    // The post arrived between the feed request and this first poll.
    statusBody = makeStatus({ latest_post_id: 9 });
    const fetchPageOne = vi.fn(async () => makeRosterPage([makeRow({ post_id: 9 }), makeRow({ post_id: 4 })]));

    renderHook(() => useStatusPoll({ enabled: true, feedKey, fetchPageOne }), { wrapper });
    await poll();

    expect(fetchPageOne).toHaveBeenCalledTimes(1);
    expect(loaded(feedKey).pages[0].items[0].post_id).toBe(9);

    // The baseline landed with the page, so the same head is no longer a change.
    await poll();
    expect(fetchPageOne).toHaveBeenCalledTimes(1);
  });

  it("treats a head against an empty page one as an initial refresh, then records the baseline", async () => {
    // A desk that opened empty has no row to compare against; the first status
    // with a head must fetch page one or the page stays empty until the global
    // head moves again.
    seed(feedKey, [makeRosterPage([])]);
    statusBody = makeStatus({ latest_post_id: 9 });
    const fetchPageOne = vi.fn(async () => makeRosterPage([makeRow({ post_id: 9 })]));

    renderHook(() => useStatusPoll({ enabled: true, feedKey, fetchPageOne }), { wrapper });
    await poll();

    expect(fetchPageOne).toHaveBeenCalledTimes(1);
    expect(loaded(feedKey).pages[0].items[0].post_id).toBe(9);

    await poll();
    expect(fetchPageOne).toHaveBeenCalledTimes(1);
  });

  it("keeps an empty page one at rest while the status carries no head", async () => {
    seed(feedKey, [makeRosterPage([])]);
    statusBody = makeStatus({ latest_post_id: null });
    const fetchPageOne = vi.fn(async () => makeRosterPage([]));

    renderHook(() => useStatusPoll({ enabled: true, feedKey, fetchPageOne }), { wrapper });
    await poll();
    await poll();

    expect(fetchPageOne).not.toHaveBeenCalled();
  });

  it("leaves a roster page one alone while the status head matches its newest row", async () => {
    seed(feedKey, [makeRosterPage([makeRow({ post_id: 9 }), makeRow({ post_id: 4 })])]);
    statusBody = makeStatus({ latest_post_id: 9 });
    const fetchPageOne = vi.fn(async () => makeRosterPage([makeRow({ post_id: 9 })]));

    renderHook(() => useStatusPoll({ enabled: true, feedKey, fetchPageOne }), { wrapper });
    await poll();
    await poll();

    expect(fetchPageOne).not.toHaveBeenCalled();
    expect(loaded(feedKey).pages[0].items[0].post_id).toBe(9);
  });

  it("does not refresh while the loaded page's version still stands", async () => {
    seed(feedKey, [makeFeedPage([makeRow({ post_id: 1 })], { feed_version: "v1" })]);
    const fetchPageOne = vi.fn(async () => makeFeedPage([makeRow({ post_id: 9 })]));

    renderHook(() => useStatusPoll({ enabled: true, feedKey, fetchPageOne, feedVersion: "v1" }), { wrapper });
    await poll();
    await poll();

    expect(fetchPageOne).not.toHaveBeenCalled();
    expect(loaded(feedKey).pages[0].items[0].post_id).toBe(1);
  });

  it("keeps the version when the refresh fails, so the next poll asks for the same change again", async () => {
    seed(feedKey, [makeFeedPage([makeRow({ post_id: 1 })], { feed_version: "v1" })]);
    statusBody = makeStatus({ feed_version: "v2", latest_post_id: 9 });
    let attempts = 0;
    const fetchPageOne = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("gateway hiccup");
      return makeFeedPage([makeRow({ post_id: 9 })], { feed_version: "v2" });
    });

    renderHook(() => useStatusPoll({ enabled: true, feedKey, fetchPageOne, feedVersion: "v1" }), { wrapper });
    await poll();
    expect(fetchPageOne).toHaveBeenCalledTimes(1);
    expect(loaded(feedKey).pages[0].items[0].post_id).toBe(1);

    // The version was never consumed by the failure: the same status answer
    // still reads as a change.
    await poll();
    expect(fetchPageOne).toHaveBeenCalledTimes(2);
    expect(loaded(feedKey).pages[0].items[0].post_id).toBe(9);
  });

  it("re-applies a change first seen while nothing was loaded under the key", async () => {
    // The poll runs on an empty view too, so the first change it reads often
    // arrives before page one does.
    statusBody = makeStatus({ feed_version: "v2", latest_post_id: 9 });
    const fetchPageOne = vi.fn(async () => makeFeedPage([makeRow({ post_id: 9 })], { feed_version: "v2" }));

    renderHook(() => useStatusPoll({ enabled: true, feedKey, fetchPageOne, feedVersion: "v1" }), { wrapper });
    await poll();
    expect(fetchPageOne).not.toHaveBeenCalled();

    // Page one lands, built on the head the request carried.
    seed(feedKey, [makeFeedPage([makeRow({ post_id: 1 })], { feed_version: "v1" })]);
    await poll();

    expect(fetchPageOne).toHaveBeenCalledTimes(1);
    expect(loaded(feedKey).pages[0].items[0].post_id).toBe(9);
  });

  it("leaves the change alone while page one is still in flight", async () => {
    seed(feedKey, [makeFeedPage([makeRow({ post_id: 1 })], { feed_version: "v1" })]);
    const inFlight = deferred<InfiniteData<CurationFeedPage>>();
    void queryClient
      .fetchQuery({ queryKey: feedKey, queryFn: () => inFlight.promise, staleTime: 0 })
      .catch(() => undefined);
    statusBody = makeStatus({ feed_version: "v2", latest_post_id: 9 });
    const fetchPageOne = vi.fn(async () => makeFeedPage([makeRow({ post_id: 9 })], { feed_version: "v2" }));

    renderHook(() => useStatusPoll({ enabled: true, feedKey, fetchPageOne, feedVersion: "v1" }), { wrapper });
    await poll();
    // That request was sent under the older head, so its answer would put the
    // change back the moment it installs.
    expect(fetchPageOne).not.toHaveBeenCalled();

    await act(async () => {
      inFlight.resolve({
        pages: [makeFeedPage([makeRow({ post_id: 1 })], { feed_version: "v1" })],
        pageParams: [undefined],
      });
    });
    await flush();
    await poll();

    expect(fetchPageOne).toHaveBeenCalledTimes(1);
    expect(loaded(feedKey).pages[0].items[0].post_id).toBe(9);
  });

  it("resets to the refreshed page instead of leaving a hole behind a new head", async () => {
    seed(feedKey, [
      makeFeedPage([makeRow({ post_id: 100 }), makeRow({ post_id: 76 })], { feed_version: "v1" }),
      makeFeedPage([makeRow({ post_id: 75 }), makeRow({ post_id: 51 })], { feed_version: "v1" }),
    ]);
    statusBody = makeStatus({ feed_version: "v2", latest_post_id: 105 });
    const fetchPageOne = vi.fn(async () =>
      makeFeedPage([makeRow({ post_id: 105 }), makeRow({ post_id: 81 })], { feed_version: "v2" })
    );

    renderHook(() => useStatusPoll({ enabled: true, feedKey, fetchPageOne, feedVersion: "v1" }), { wrapper });
    await poll();

    const data = loaded(feedKey);
    // Page two was selected under the old head, so its cursor no longer joins
    // up with the refreshed page: 80 to 76 would be missing between them.
    expect(data.pages).toHaveLength(1);
    expect(data.pageParams).toEqual([undefined]);
    expect(data.pages[0].items.map((r) => r.post_id)).toEqual([105, 81]);
  });

  it("installs nothing when the filters change while page one is in flight", async () => {
    seed(feedKey, [makeFeedPage([makeRow({ post_id: 1 })], { feed_version: "v1" })]);
    seed(otherFeedKey, [makeFeedPage([makeRow({ post_id: 2 })], { feed_version: "v1" })]);
    const gate = deferred<CurationFeedPage>();
    const fetchPageOne = vi.fn(() => gate.promise);
    const otherFetchPageOne = vi.fn(async () => makeFeedPage([makeRow({ post_id: 8 })]));

    const { rerender } = renderHook(
      ({ key, fetcher }: { key: unknown[]; fetcher: () => Promise<CurationFeedPage> }) =>
        useStatusPoll({ enabled: true, feedKey: key, fetchPageOne: fetcher, feedVersion: "v1" }),
      { wrapper, initialProps: { key: feedKey as unknown[], fetcher: fetchPageOne } }
    );
    // One quiet poll first, so the next one is a refresh and not a baseline.
    await poll();
    expect(fetchPageOne).not.toHaveBeenCalled();

    statusBody = makeStatus({ feed_version: "v2", latest_post_id: 9 });
    await poll();
    expect(fetchPageOne).toHaveBeenCalledTimes(1);

    // Page one of the queue the viewer is leaving is still in flight.
    rerender({ key: otherFeedKey, fetcher: otherFetchPageOne });
    gate.resolve(makeFeedPage([makeRow({ post_id: 9 })], { feed_version: "v2" }));
    await flush();

    // Those rows were selected for the filters that just went away.
    expect(loaded(otherFeedKey).pages[0].items[0].post_id).toBe(2);
    expect(loaded(feedKey).pages[0].items[0].post_id).toBe(1);
    expect(otherFetchPageOne).not.toHaveBeenCalled();
  });

  it("runs one refresh at a time when the interval and a visibilitychange overlap", async () => {
    seed(feedKey, [makeFeedPage([makeRow({ post_id: 1 })], { feed_version: "v1" })]);
    statusBody = makeStatus({ feed_version: "v2", latest_post_id: 9 });
    const gate = deferred<CurationFeedPage>();
    const fetchPageOne = vi.fn(() => gate.promise);

    renderHook(() => useStatusPoll({ enabled: true, feedKey, fetchPageOne, feedVersion: "v1" }), { wrapper });
    await poll();
    expect(router.callsTo(/curation-desk\/status/)).toHaveLength(1);
    expect(fetchPageOne).toHaveBeenCalledTimes(1);

    // Page one is still in flight: another poll would ask status again and,
    // with the version still uncommitted, start a second refresh.
    await poll();
    await poll();
    expect(router.callsTo(/curation-desk\/status/)).toHaveLength(1);
    expect(fetchPageOne).toHaveBeenCalledTimes(1);

    gate.resolve(makeFeedPage([makeRow({ post_id: 9 })], { feed_version: "v2" }));
    await flush();
    expect(loaded(feedKey).pages[0].items[0].post_id).toBe(9);
  });
});

import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, screen } from "@testing-library/react";
import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurationFeedPage } from "@ecency/sdk";
import { renderWithQueryClient } from "@/specs/test-utils";
import { installFetchRouter, jsonResponse, makeFeedPage, makePost, makeRoster, makeRow } from "./curation-test-utils";

const state = vi.hoisted(() => ({ username: "member1" as string | undefined }));

vi.mock("@ecency/sdk", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")) }));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  ensureValidToken: vi.fn(async () => "code-1"),
}));
vi.mock("@/core/hooks/use-active-username", () => ({ useActiveUsername: () => state.username }));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: { username: state.username }, account: null, isLoading: false }),
}));
vi.mock("@/core/global-store", () => ({
  useGlobalStore: (selector: (s: unknown) => unknown) => selector({ toggleUiProp: vi.fn(), activeUser: { username: state.username } }),
}));
vi.mock("@/features/shared/feedback", () => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/api/format-error", () => ({ formatError: (e: unknown) => [String(e), "common"] }));
vi.mock("@ui/modal", () => ({
  Modal: ({ show, children }: { show: boolean; children: React.ReactNode }) => (show ? <div role="dialog">{children}</div> : null),
  ModalHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/api/sdk-mutations/use-curation-recommend-mutation", () => ({
  useCurationRecommendMutation: () => ({ isPending: false, mutateAsync: async () => ({ tx_id: "e".repeat(40) }) }),
}));

import { CurationRecommendBtn } from "@/features/curation-desk/curation-recommend-btn";
import { resetRecommendFlowForTests } from "@/features/curation-desk/curation-recommend-flow";
import { getRecommendState, resetRecommendStoreForTests } from "@/features/curation-desk/curation-recommend-store";
import { getCurationFeedInfiniteQueryOptions } from "@ecency/sdk";

describe("recommend state after a broadcast", () => {
  let router: ReturnType<typeof installFetchRouter>;
  const row = makeRow({ post_id: 1, author: "alice", permlink: "morning-light", recommend_count: 3, unique_recommenders: 2 });
  let listsViewer = false;

  beforeEach(() => {
    vi.useFakeTimers();
    listsViewer = false;
    resetRecommendFlowForTests();
    resetRecommendStoreForTests();
    router = installFetchRouter()
      .on(/curation-desk\/roster$/, () => makeRoster())
      .on(/curation-desk\/recommend-meta$/, () => jsonResponse({ ok: true }, 202))
      .on(/curation-desk\/post\//, () =>
        listsViewer
          ? makePost(row, {
              recommend_count: 4,
              unique_recommenders: 3,
              recommenders: [{ username: "member1", rep: 55, reason: "quality", at: "2026-09-05T12:00:03Z", has_meta: true }],
            })
          : makePost(row, { recommend_count: 3, unique_recommenders: 2, recommenders: [] })
      );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function broadcast() {
    await act(async () => {
      fireEvent.click(screen.getByLabelText("curation-desk.recommend.aria"));
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("curation-desk.recommend.confirm"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
  }

  it("flips to Recommended · Withdraw on success, polls at 5, 15 and 30 s and updates the count at the first poll that lists the viewer", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const feedKey = getCurationFeedInfiniteQueryOptions({ sort: "newest" }).queryKey;
    queryClient.setQueryData<InfiniteData<CurationFeedPage>>(feedKey, { pages: [makeFeedPage([row])], pageParams: [undefined] });

    renderWithQueryClient(<CurationRecommendBtn author="alice" permlink="morning-light" />, { queryClient });
    await broadcast();

    // Optimistic flip, the memoized route 5 body still says "not recommended".
    expect(screen.getByText(/curation-desk.recommend.recommended/)).toBeInTheDocument();
    expect(screen.getByLabelText("curation-desk.recommend.withdraw-aria")).toBeInTheDocument();
    expect(router.callsTo(/curation-desk\/post\//)).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(router.callsTo(/curation-desk\/post\//)).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(router.callsTo(/curation-desk\/post\//)).toHaveLength(2);

    // The memo expires between 15 and 30 s: the 30 s poll lists the viewer.
    listsViewer = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(router.callsTo(/curation-desk\/post\//)).toHaveLength(3);
    expect(getRecommendState("alice", "morning-light")).toEqual({ phase: "recommended", confirmed: true });
    const feed = queryClient.getQueryData<InfiniteData<CurationFeedPage>>(feedKey)!;
    expect(feed.pages[0].items[0].recommend_count).toBe(4);
    expect(feed.pages[0].items[0].unique_recommenders).toBe(3);

    // Confirmed: no 60 s poll.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(router.callsTo(/curation-desk\/post\//)).toHaveLength(3);
    expect(screen.getByLabelText("curation-desk.recommend.withdraw-aria")).toBeInTheDocument();
  });

  it("after 60 s of misses shows sent, confirming with Withdraw and never renders Recommend again", async () => {
    renderWithQueryClient(<CurationRecommendBtn author="alice" permlink="morning-light" />);
    await broadcast();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(router.callsTo(/curation-desk\/post\//)).toHaveLength(4);
    expect(getRecommendState("alice", "morning-light")).toEqual({ phase: "confirming", withdraw: false });
    expect(screen.getByText(/curation-desk.recommend.confirming/)).toBeInTheDocument();
    expect(screen.getByLabelText("curation-desk.recommend.withdraw-aria")).toBeInTheDocument();
    expect(screen.queryByLabelText("curation-desk.recommend.aria")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(screen.queryByLabelText("curation-desk.recommend.aria")).toBeNull();
  });
});

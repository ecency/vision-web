import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";
import { installFetchRouter, jsonResponse, makePost, makeRoster, makeRow } from "./curation-test-utils";

const state = vi.hoisted(() => ({
  username: "member1" as string | undefined,
  result: (() => Promise.resolve<unknown>({ tx_id: "e".repeat(40) })) as () => Promise<unknown>,
  broadcasts: [] as boolean[],
}));

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
  useGlobalStore: (selector: (s: unknown) => unknown) =>
    selector({ toggleUiProp: vi.fn(), activeUser: { username: state.username } }),
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
  useCurationRecommendMutation: () => ({
    isPending: false,
    mutateAsync: async (input: { withdraw?: boolean }) => {
      state.broadcasts.push(!!input.withdraw);
      return state.result();
    },
  }),
}));

import { CurationRecommendBtn } from "@/features/curation-desk/curation-recommend-btn";
import { resetRecommendFlowForTests } from "@/features/curation-desk/curation-recommend-flow";
import { getRecommendState, resetRecommendStoreForTests } from "@/features/curation-desk/curation-recommend-store";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/**
 * What the confirming poll may treat as proof. Route 5 is memoized at the
 * gateway, so an answer can be older than the broadcast that asked about it.
 */
describe("recommend confirmation", () => {
  let router: ReturnType<typeof installFetchRouter>;
  const row = makeRow({ post_id: 1, author: "alice", permlink: "morning-light", recommend_count: 4, unique_recommenders: 3 });
  const mine = { username: "member1", rep: 55, reason: "quality" as const, at: "2026-09-05T12:00:03Z", has_meta: true };

  beforeEach(() => {
    vi.useFakeTimers();
    state.username = "member1";
    state.result = () => Promise.resolve({ tx_id: "e".repeat(40) });
    state.broadcasts.length = 0;
    resetRecommendFlowForTests();
    resetRecommendStoreForTests();
    router = installFetchRouter()
      .on(/curation-desk\/roster$/, () => makeRoster())
      .on(/curation-desk\/recommend-meta$/, () => jsonResponse({ ok: true }, 202));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function clickWithdraw() {
    await act(async () => {
      fireEvent.click(screen.getByLabelText("curation-desk.recommend.withdraw-aria"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
  }

  it("never reads a body that has not listed the viewer as a withdrawal", async () => {
    // Every answer predates the recommendation, so the missing name says
    // nothing about the withdrawal.
    router.on(/curation-desk\/post\//, () => makePost(row, { recommend_count: 4, recommenders: [] }));
    renderWithQueryClient(<CurationRecommendBtn author="alice" permlink="morning-light" alreadyRecommended />);
    await clickWithdraw();
    expect(state.broadcasts).toEqual([true]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(getRecommendState("member1", "alice", "morning-light").phase).toBe("pending");

    // The backoff ceiling still ends in the neutral state, never in "withdrawn".
    await act(async () => {
      await vi.advanceTimersByTimeAsync(56_000);
    });
    expect(router.callsTo(/curation-desk\/post\//)).toHaveLength(4);
    expect(getRecommendState("member1", "alice", "morning-light")).toEqual({ phase: "confirming", withdraw: true });
  });

  it("confirms the withdrawal once an answer that listed the viewer stops listing them", async () => {
    let listsViewer = true;
    router.on(/curation-desk\/post\//, () =>
      listsViewer
        ? makePost(row, { recommend_count: 4, recommenders: [mine] })
        : makePost(row, { recommend_count: 3, recommenders: [] })
    );
    renderWithQueryClient(<CurationRecommendBtn author="alice" permlink="morning-light" alreadyRecommended />);
    await clickWithdraw();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(getRecommendState("member1", "alice", "morning-light").phase).toBe("pending");

    listsViewer = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(getRecommendState("member1", "alice", "morning-light")).toEqual({ phase: "withdrawn" });
  });

  it("confirms the withdrawal on a recommend_count that dropped", async () => {
    // The memo never listed this viewer, so only the count can say the row moved.
    let count = 4;
    router.on(/curation-desk\/post\//, () => makePost(row, { recommend_count: count, recommenders: [] }));
    renderWithQueryClient(<CurationRecommendBtn author="alice" permlink="morning-light" alreadyRecommended />);
    await clickWithdraw();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(getRecommendState("member1", "alice", "morning-light").phase).toBe("pending");

    count = 3;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(getRecommendState("member1", "alice", "morning-light")).toEqual({ phase: "withdrawn" });
  });

  it("a broadcast that resolves after the poll confirmed never downgrades the state", async () => {
    router.on(/curation-desk\/post\//, () => makePost(row, { recommend_count: 5, recommenders: [mine] }));
    // A HiveSigner redirect or a Keychain Mobile deep link resolves long after
    // the poll already read the chain.
    const gate = deferred<unknown>();
    state.result = () => gate.promise;

    renderWithQueryClient(<CurationRecommendBtn author="alice" permlink="morning-light" />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText("curation-desk.recommend.aria"));
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("curation-desk.recommend.confirm"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(getRecommendState("member1", "alice", "morning-light")).toEqual({ phase: "recommended", confirmed: true });

    await act(async () => {
      gate.resolve({ tx_id: "f".repeat(40) });
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(getRecommendState("member1", "alice", "morning-light")).toEqual({ phase: "recommended", confirmed: true });
    expect(screen.getByLabelText("curation-desk.recommend.withdraw-aria")).toBeInTheDocument();
  });
});

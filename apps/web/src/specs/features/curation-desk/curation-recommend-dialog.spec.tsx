import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";
import { installFetchRouter, jsonResponse, makePost, makeRow } from "./curation-test-utils";

const state = vi.hoisted(() => ({
  username: "member1" as string | undefined,
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
      return { tx_id: "e".repeat(40) };
    },
  }),
}));

import { CurationRecommendDialog } from "@/features/curation-desk/curation-recommend-btn";
import { resetRecommendFlowForTests } from "@/features/curation-desk/curation-recommend-flow";
import { resetRecommendStoreForTests, setRecommendState } from "@/features/curation-desk/curation-recommend-store";

/**
 * The entry menu is a second surface onto one flow state. It must read that
 * state: a picker offered over a recommendation already sent turns every
 * confirmation into another identical broadcast.
 */
describe("CurationRecommendDialog", () => {
  const row = makeRow({ post_id: 1, author: "alice", permlink: "morning-light" });

  beforeEach(() => {
    vi.useFakeTimers();
    state.username = "member1";
    state.broadcasts.length = 0;
    resetRecommendFlowForTests();
    resetRecommendStoreForTests();
    installFetchRouter()
      .on(/curation-desk\/recommend-meta$/, () => jsonResponse({ ok: true }, 202))
      .on(/curation-desk\/post\//, () => makePost(row));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("offers the reason picker while the viewer has not recommended this post", async () => {
    renderWithQueryClient(<CurationRecommendDialog author="alice" permlink="morning-light" onHide={vi.fn()} />);
    expect(screen.getByLabelText("curation-desk.recommend.reason-label")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByLabelText("curation-desk.recommend.confirm"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(state.broadcasts).toEqual([false]);
  });

  it.each([
    ["recommended", { phase: "recommended", confirmed: true } as const],
    ["confirming", { phase: "confirming", withdraw: false } as const],
  ])("offers Withdraw instead of a second broadcast while the state is %s", async (_name, current) => {
    setRecommendState("member1", "alice", "morning-light", current);
    const onHide = vi.fn();
    renderWithQueryClient(<CurationRecommendDialog author="alice" permlink="morning-light" onHide={onHide} />);

    expect(screen.queryByLabelText("curation-desk.recommend.reason-label")).toBeNull();
    expect(screen.queryByLabelText("curation-desk.recommend.confirm")).toBeNull();
    expect(screen.getByText("curation-desk.recommend.already-title")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByLabelText("curation-desk.recommend.withdraw-aria"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(state.broadcasts).toEqual([true]);
    expect(onHide).toHaveBeenCalled();
  });
});

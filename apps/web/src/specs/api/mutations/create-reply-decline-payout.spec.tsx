import React from "react";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Entry } from "@/entities";

// Real helpers: makeCommentOptions is what the publish flow uses for "Decline
// payout", and the reply must serialise its comment_options the same way.
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({
    activeUser: { username: "bob" },
    account: { name: "bob", post_count: 1, reputation: 0, posting_json_metadata: "" }
  })
}));

vi.mock("@/core/caches", () => ({
  EcencyEntriesCacheManagement: {
    useUpdateEntry: () => ({ updateEntryQueryData: vi.fn() }),
    useAddReply: () => ({ addReply: vi.fn() })
  }
}));

vi.mock("@/features/shared", () => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("@/utils/refresh-quests", () => ({ scheduleQuestsRefresh: vi.fn() }));

vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
  addOptimisticDiscussionEntry: vi.fn(),
  removeOptimisticDiscussionEntry: vi.fn()
}));

const sdkComment = vi.hoisted(() => vi.fn());
vi.mock("@/api/sdk-mutations", () => ({
  useCommentMutation: () => ({ mutateAsync: sdkComment })
}));

import { useCreateReply } from "@/api/mutations/create-reply";

const parent = {
  author: "alice",
  permlink: "post-1",
  category: "ecency",
  json_metadata: { tags: ["ecency"] }
} as unknown as Entry;

function setup(onBlockchainError?: (...args: unknown[]) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useCreateReply(parent, parent, undefined, onBlockchainError), { wrapper });
}

const base = {
  permlink: "re-alice-1",
  text: "a reply",
  jsonMeta: { tags: ["ecency"], app: "ecency/1", format: "markdown+html" },
  point: true
};

describe("useCreateReply: decline payout", () => {
  beforeEach(() => {
    sdkComment.mockReset();
    sdkComment.mockResolvedValue({ id: "tx" });
  });

  it("broadcasts comment_options with a zero max payout in the same call", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.mutateAsync({ ...base, declinePayout: true });
    });

    expect(sdkComment).toHaveBeenCalledTimes(1);
    const payload = sdkComment.mock.calls[0][0];
    expect(payload.permlink).toBe("re-alice-1");
    expect(payload.options).toEqual({
      maxAcceptedPayout: "0.000 HBD",
      percentHbd: 10000,
      allowVotes: true,
      allowCurationRewards: true,
      beneficiaries: []
    });
  });

  it("marks the optimistic reply as declined so the payout shows it at once", async () => {
    const { result } = setup();

    let optimistic: Entry | undefined;
    await act(async () => {
      optimistic = await result.current.mutateAsync({ ...base, declinePayout: true });
    });

    expect(optimistic?.max_accepted_payout).toBe("0.000 HBD");
  });

  it("sends no comment_options when the reply keeps its payout", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.mutateAsync({ ...base, declinePayout: false });
    });

    expect(sdkComment).toHaveBeenCalledTimes(1);
    expect(sdkComment.mock.calls[0][0].options).toBeUndefined();
  });

  it("hands a failed reply back with the payout choice it was sent with", async () => {
    // Reply A declines and fails after reply B, which keeps its payout, was sent:
    // the failure itself carries A's choice, so B cannot overwrite it.
    let failA: (err: unknown) => void = () => {};
    sdkComment.mockImplementationOnce(() => new Promise((_, reject) => (failA = reject)));
    sdkComment.mockResolvedValueOnce({ id: "tx-b" });
    const onBlockchainError = vi.fn();
    const { result } = setup(onBlockchainError);

    await act(async () => {
      await result.current.mutateAsync({ ...base, text: "reply A", declinePayout: true });
      await result.current.mutateAsync({ ...base, permlink: "re-alice-2", text: "reply B", declinePayout: false });
    });
    const err = new Error("rc");
    await act(async () => {
      failA(err);
    });

    expect(onBlockchainError).toHaveBeenCalledTimes(1);
    expect(onBlockchainError).toHaveBeenCalledWith("reply A", err, { declinePayout: true });
  });
});

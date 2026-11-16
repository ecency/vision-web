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
    expect(onBlockchainError).toHaveBeenCalledWith("reply A", err, { declinePayout: true, username: "bob" });
  });
});

// #2104: the composer clears its draft on submit, so a broadcast that fails after
// the reader left the post (the box unmounted, no callback to restore into) used
// to lose the text. The failure itself puts the text back into the post's reply
// draft, with the payout choice it was sent with, for whichever box opens next.
describe("useCreateReply: a failed reply is kept for the post", () => {
  const draft = () => window.localStorage.getItem("ecency_reply_text_alice_post-1");
  const decline = () => window.localStorage.getItem("ecency_reply_failed_decline_bob_alice_post-1");

  async function failWith(declinePayout: boolean, text = "a reply") {
    sdkComment.mockRejectedValueOnce(new Error("rc"));
    const { result } = setup();
    await act(async () => {
      await result.current.mutateAsync({ ...base, text, declinePayout });
    });
    await act(async () => {});
  }

  beforeEach(() => {
    window.localStorage.clear();
    sdkComment.mockReset();
  });

  it("puts the text back into the post's reply draft with no box mounted", async () => {
    await failWith(false);
    expect(draft()).toBe(JSON.stringify("a reply"));
    expect(decline()).toBeNull();
  });

  it("keeps a declined reply declined for its sender", async () => {
    await failWith(true);
    expect(draft()).toBe(JSON.stringify("a reply"));
    expect(decline()).toBe(JSON.stringify("a reply"));
  });

  it("a later undeclined failure of the same text drops the decline", async () => {
    await failWith(true);
    await failWith(false);
    expect(decline()).toBeNull();
  });

  // A newer draft the writer started meanwhile (another box, another account) is
  // theirs: the failed text goes back only into a blank draft or its own text.
  it("does not overwrite a newer draft for the post", async () => {
    window.localStorage.setItem("ecency_reply_text_alice_post-1", JSON.stringify("a newer draft"));
    await failWith(true);
    expect(draft()).toBe(JSON.stringify("a newer draft"));
  });

  it("writes nothing on success", async () => {
    sdkComment.mockResolvedValue({ id: "tx" });
    const { result } = setup();
    await act(async () => {
      await result.current.mutateAsync({ ...base, declinePayout: true });
    });
    await act(async () => {});
    expect(draft()).toBeNull();
    expect(decline()).toBeNull();
  });
});

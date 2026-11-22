import React from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Entry } from "@/entities";
import { useActiveAccount } from "@/core/hooks/use-active-account";

// #2196: every broadcast path that can run out of RC reports it. These pin the
// wiring of the paths that have no spec of their own.

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

const m = vi.hoisted(() => {
  const broadcast = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    transfer: broadcast(),
    transferPoint: broadcast(),
    toSavings: broadcast(),
    fromSavings: broadcast(),
    toVesting: broadcast(),
    withdrawVesting: broadcast(),
    convert: broadcast(),
    claimInterest: broadcast(),
    delegate: broadcast(),
    transferEngine: broadcast(),
    reblog: broadcast(),
    updateReply: broadcast()
  };
});
vi.mock("@/api/sdk-mutations", () => ({
  useTransferMutation: () => m.transfer,
  useTransferPointMutation: () => m.transferPoint,
  useTransferToSavingsMutation: () => m.toSavings,
  useTransferFromSavingsMutation: () => m.fromSavings,
  useTransferToVestingMutation: () => m.toVesting,
  useWithdrawVestingMutation: () => m.withdrawVesting,
  useConvertMutation: () => m.convert,
  useClaimInterestMutation: () => m.claimInterest,
  useDelegateVestingSharesMutation: () => m.delegate,
  useTransferEngineTokenMutation: () => m.transferEngine,
  useReblogMutation: () => m.reblog,
  useUpdateReplyMutation: () => m.updateReply
}));
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
  getDynamicPropsQueryOptions: () => ({
    queryKey: ["dynamic-props"],
    queryFn: async () => ({ hivePerMVests: 500 })
  }),
  updateEntryInCache: vi.fn(),
  restoreEntryInCache: vi.fn()
}));
vi.mock("@/features/wallet/utils/invalidate-wallet-queries", () => ({
  invalidateWalletQueries: vi.fn()
}));
vi.mock("@/core/caches", () => ({
  EcencyEntriesCacheManagement: {
    useUpdateReblogsCount: () => ({ update: vi.fn() }),
    useUpdateEntry: () => ({ updateEntryQueryData: vi.fn() })
  }
}));
vi.mock("@/api/mutations/validate-post-updating", () => ({
  useValidatePostUpdating: () => ({ mutateAsync: vi.fn(async () => undefined) })
}));
vi.mock("@/utils/refresh-quests", () => ({ scheduleQuestsRefresh: vi.fn() }));
vi.mock("@/features/shared", () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
// Tests must never reach production Sentry.
const sentry = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock("@/core/sentry/lazy-sentry", () => ({ sentry }));

import { useSignTransfer } from "@/api/mutations/sign-transfer";
import { useEntryReblog } from "@/api/mutations/entry-reblog-sdk";
import { useUpdateReply } from "@/api/mutations/update-reply";

function mount<R>(useHook: () => R) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return renderHook(useHook, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }).result;
}

const rcRejection = () =>
  new Error("Account: alice has 100 RC, needs 2000 RC. Please wait to transact or power up HIVE.");

function expectOneReport(op: string) {
  expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
  expect(sentry.captureMessage).toHaveBeenCalledWith(`rc-shortfall: rejected/${op}`, {
    level: "info",
    fingerprint: ["rc-shortfall"],
    tags: { "rc.stage": "rejected", "rc.op": op },
    user: { username: "alice" }
  });
}

beforeEach(() => {
  sentry.captureMessage.mockReset();
  vi.mocked(useActiveAccount).mockReturnValue({
    activeUser: { username: "alice" },
    username: "alice",
    account: { name: "alice" },
    isLoading: false
  } as unknown as ReturnType<typeof useActiveAccount>);
});

describe("useSignTransfer", () => {
  it("reports a transfer rejected for RC and still rejects to the caller", async () => {
    const err = rcRejection();
    m.transfer.mutateAsync.mockRejectedValue(err);
    const result = mount(() => useSignTransfer("transfer", "HIVE"));

    await expect(result.current.mutateAsync({ to: "bob", amount: "1", memo: "" })).rejects.toBe(err);

    expectOneReport("transfer");
  });

  it("sends nothing for a transfer rejected for another reason", async () => {
    m.transfer.mutateAsync.mockRejectedValue(new Error("Missing Active Authority alice"));
    const result = mount(() => useSignTransfer("transfer", "HIVE"));

    await expect(result.current.mutateAsync({ to: "bob", amount: "1", memo: "" })).rejects.toThrow();

    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });
});

describe("useEntryReblog", () => {
  it("reports a reblog rejected for RC", async () => {
    m.reblog.mutateAsync.mockRejectedValue(rcRejection());
    const result = mount(() => useEntryReblog({ author: "bob", permlink: "p" } as Entry));

    await act(async () => {
      await result.current.mutateAsync({ isDelete: false }).catch(() => undefined);
    });

    expectOneReport("reblog");
  });
});

describe("useUpdateReply", () => {
  const reply = {
    author: "alice",
    permlink: "re-bob-p",
    parent_author: "bob",
    parent_permlink: "p",
    category: "hive",
    body: "old"
  } as unknown as Entry;
  const vars = { text: "edited", jsonMeta: {} as never, point: false };

  it("reports an edit rejected for RC by the chain (background path)", async () => {
    m.updateReply.mutateAsync.mockRejectedValue(rcRejection());
    const result = mount(() => useUpdateReply(reply));

    await act(async () => {
      await result.current.mutateAsync(vars);
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

    expectOneReport("comment");
  });

  it("reports an edit that fails for RC before it is handed off (sync path)", async () => {
    m.updateReply.mutateAsync.mockImplementation(() => {
      throw rcRejection();
    });
    const result = mount(() => useUpdateReply(reply));

    await act(async () => {
      await result.current.mutateAsync(vars).catch(() => undefined);
    });

    expectOneReport("comment");
  });

  it("tags an edited post as a post", async () => {
    m.updateReply.mutateAsync.mockRejectedValue(rcRejection());
    const post = { ...reply, parent_author: "", parent_permlink: "hive" } as unknown as Entry;
    const result = mount(() => useUpdateReply(post));

    await act(async () => {
      await result.current.mutateAsync(vars);
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

    expectOneReport("post");
  });
});

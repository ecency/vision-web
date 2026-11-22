import React from "react";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Entry } from "@/entities";
import { ErrorTypes } from "@/enums";

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
vi.mock("@/features/shared/comment/failed-decline", () => ({ keepFailedReply: vi.fn() }));
vi.mock("@/core/global-store", () => ({
  useGlobalStore: { getState: () => ({ activeUser: { username: "bob" } }) }
}));
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

// Tests must never reach production Sentry.
const sentry = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock("@/core/sentry/lazy-sentry", () => ({ sentry }));

import { useCreateReply } from "@/api/mutations/create-reply";
import { formatError } from "@/api/format-error";
import { reportRcRejection } from "@/api/rc-shortfall-report";
import { error } from "@/features/shared";

const parent = {
  author: "alice",
  permlink: "post-1",
  category: "ecency",
  json_metadata: { tags: ["ecency"] }
} as unknown as Entry;

const base = {
  permlink: "re-alice-1",
  text: "a reply",
  jsonMeta: { tags: ["ecency"], app: "ecency/1", format: "markdown+html" },
  point: true
};

function setup(onBlockchainError?: (...args: unknown[]) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useCreateReply(parent, parent, undefined, onBlockchainError), { wrapper });
}

async function failWith(err: unknown, onBlockchainError?: (...args: unknown[]) => void) {
  sdkComment.mockRejectedValueOnce(err);
  const { result } = setup(onBlockchainError);
  await act(async () => {
    await result.current.mutateAsync(base);
  });
  // The failure is handed back on the next task.
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}

const rcRejection = () => new Error("Account: bob has 100 RC, needs 2000 RC. Please wait to transact or power up HIVE.");

// #2196
describe("useCreateReply: out-of-RC telemetry", () => {
  beforeEach(() => {
    sdkComment.mockReset();
    sentry.captureMessage.mockReset();
    vi.mocked(error).mockClear();
  });

  it("reports an RC rejection once, with the replying account", async () => {
    await failWith(rcRejection());

    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).toHaveBeenCalledWith("rc-shortfall: rejected/comment", {
      level: "info",
      fingerprint: ["rc-shortfall"],
      tags: { "rc.stage": "rejected", "rc.op": "comment" },
      user: { username: "bob" }
    });
  });

  it("still reports once when the caller also classifies and reports the failure", async () => {
    // The caller runs formatError on the same failure, as the comment box does.
    const onBlockchainError = vi.fn((_text: unknown, err: unknown) => {
      formatError(err);
      reportRcRejection(err, "comment", "bob");
    });

    await failWith(rcRejection(), onBlockchainError);

    expect(onBlockchainError).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
  });

  it("sends nothing for a failure that is not about RC", async () => {
    await failWith(new Error("Bandwidth limit exceeded"));
    await failWith(new Error("Missing Posting Authority bob"));

    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("shows the same RC hint when Sentry throws", async () => {
    sentry.captureMessage.mockImplementation(() => {
      throw new Error("sentry down");
    });

    await failWith(rcRejection());

    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("comment.rc-error-hint", ErrorTypes.INSUFFICIENT_RESOURCE_CREDITS);
  });
});

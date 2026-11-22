import React from "react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Entry } from "@/entities";

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: { username: "alice" }, username: "alice" })
}));
const broadcast = vi.hoisted(() => vi.fn());
vi.mock("@/api/sdk-mutations", () => ({ useVoteMutation: () => ({ mutateAsync: broadcast }) }));
// Tests must never reach production Sentry.
const sentry = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock("@/core/sentry/lazy-sentry", () => ({ sentry }));

import { useEntryVote } from "@/api/mutations/entry-vote";

function setup() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const entry = { author: "bob", permlink: "p" } as Entry;
  return renderHook(() => useEntryVote(entry), { wrapper }).result;
}

// #2196
describe("useEntryVote: out-of-RC telemetry", () => {
  beforeEach(() => {
    broadcast.mockReset();
    sentry.captureMessage.mockReset();
  });

  it("reports a vote rejected for RC and still rejects to the caller", async () => {
    const err = new Error("Account: alice has 100 RC, needs 2000 RC. Please wait to transact or power up HIVE.");
    broadcast.mockRejectedValue(err);
    const hook = setup();

    await expect(hook.current.mutateAsync({ weight: 10000, estimated: 0 })).rejects.toBe(err);

    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).toHaveBeenCalledWith("rc-shortfall", {
      level: "info",
      fingerprint: ["rc-shortfall"],
      tags: { "rc.stage": "rejected", "rc.op": "vote" },
      user: { username: "alice" }
    });
  });

  it("sends nothing for a vote rejected for another reason", async () => {
    broadcast.mockRejectedValue(new Error("Your current vote on this comment is identical to this vote."));
    const hook = setup();

    await expect(hook.current.mutateAsync({ weight: 10000, estimated: 0 })).rejects.toThrow();

    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });
});

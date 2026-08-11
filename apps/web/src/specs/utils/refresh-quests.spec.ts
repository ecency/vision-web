import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { scheduleQuestsRefresh } from "@/utils/refresh-quests";

// A real client, spied on, so the test is held to the actual invalidateQueries
// contract rather than an `as any` stand-in that would survive a signature change.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

describe("scheduleQuestsRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invalidateQueries.mockClear();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("waits for the backend to actually credit the action before refetching", () => {
    scheduleQuestsRefresh(queryClient, "alice");

    // A chain action is verified and processed a little over a minute after it is
    // broadcast. Refreshing at 4s (the old delay) re-read the pre-action numbers and
    // then marked them fresh, so the real update was never picked up. The lower bound
    // is tight on purpose: a regression to any sub-minute delay has to fail here.
    vi.advanceTimersByTime(59_999);
    expect(invalidateQueries).not.toHaveBeenCalled();

    vi.advanceTimersByTime(15_001);
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("coalesces a burst of actions into one request", () => {
    scheduleQuestsRefresh(queryClient, "alice");
    vi.advanceTimersByTime(5_000);
    scheduleQuestsRefresh(queryClient, "alice");
    vi.advanceTimersByTime(5_000);
    scheduleQuestsRefresh(queryClient, "alice");

    vi.advanceTimersByTime(75_000);
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("strips a leading @ so the key matches the query", () => {
    scheduleQuestsRefresh(queryClient, "@alice");
    vi.advanceTimersByTime(75_000);

    const [{ queryKey }] = invalidateQueries.mock.calls[0];
    expect(queryKey).toContain("alice");
    expect(queryKey).not.toContain("@alice");
  });

  it("keeps a pending refresh per account, so a switch cannot cancel the other", () => {
    scheduleQuestsRefresh(queryClient, "alice");
    vi.advanceTimersByTime(5_000);
    scheduleQuestsRefresh(queryClient, "bob");

    vi.advanceTimersByTime(75_000);

    expect(invalidateQueries).toHaveBeenCalledTimes(2);
    const keys = invalidateQueries.mock.calls.map(([{ queryKey }]: any) => queryKey);
    expect(keys.some((k: string[]) => k.includes("alice"))).toBe(true);
    expect(keys.some((k: string[]) => k.includes("bob"))).toBe(true);
  });

  it("does nothing without a username", () => {
    scheduleQuestsRefresh(queryClient, undefined);
    scheduleQuestsRefresh(queryClient, null);
    vi.advanceTimersByTime(75_000);

    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});

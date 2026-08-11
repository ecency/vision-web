import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleQuestsRefresh } from "@/utils/refresh-quests";

const invalidateQueries = vi.fn();
const queryClient = { invalidateQueries } as any;

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
    // then marked them fresh, so the real update was never picked up.
    vi.advanceTimersByTime(10_000);
    expect(invalidateQueries).not.toHaveBeenCalled();

    vi.advanceTimersByTime(65_000);
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

  it("does nothing without a username", () => {
    scheduleQuestsRefresh(queryClient, undefined);
    scheduleQuestsRefresh(queryClient, null);
    vi.advanceTimersByTime(75_000);

    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});

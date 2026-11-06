import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forgetWeekWinners, useWeekWinners, weekWinners } from "@/features/raidstead/week";

const kill = (community: string) => ({ community, title: community, league: "medium", killSecs: 72_000, raiders: 9, members: 20 });
const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("week winners", () => {
  const realFetch = globalThis.fetch;
  let answers: unknown[];
  let f: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    forgetWeekWinners();
    answers = [];
    f = vi.fn(async () => reply(answers.length > 1 ? answers.shift() : answers[0]));
    globalThis.fetch = f as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
  });

  it("asks again when the week that has finished changes on an open page", async () => {
    answers = [{ season: 2, week: 0, kills: [] }, { season: 2, week: 1, kills: [kill("hive-b")] }];
    const { result, rerender } = renderHook(({ want }) => useWeekWinners(want), { initialProps: { want: "2:0" } });
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    expect(result.current).toBeNull();
    // the calendar rolled into week 2: week 1 is now the finished one
    rerender({ want: "2:1" });
    await waitFor(() => expect(result.current?.winners.medium?.community).toBe("hive-b"));
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("asks again a minute later while the server still gives the week before", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    answers = [{ season: 2, week: 0, kills: [] }, { season: 2, week: 1, kills: [kill("hive-b")] }];
    const { result } = renderHook(() => useWeekWinners("2:1"));
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    expect(result.current).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    await waitFor(() => expect(result.current?.winners.medium?.community).toBe("hive-b"));
  });

  it("never asks again on a timer when the server has no such route", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    f.mockImplementation(async () => new Response(JSON.stringify({ error: "not_found" }), { status: 404 }));
    const { result } = renderHook(() => useWeekWinners("2:1"));
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 61_000);
    });
    expect(f).toHaveBeenCalledTimes(1);
    expect(result.current).toBeNull();
  });

  it("keeps an answer no later than the next UTC midnight, when weeks end", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(Date.parse("2026-11-15T23:30:00Z"));
    answers = [{ season: 2, week: 0, kills: [] }];
    await weekWinners();
    expect(f).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.parse("2026-11-15T23:50:00Z"));
    await weekWinners();
    expect(f).toHaveBeenCalledTimes(1);
    // past midnight (and the server's own minute of caching): asked again
    vi.setSystemTime(Date.parse("2026-11-16T00:04:00Z"));
    await weekWinners();
    expect(f).toHaveBeenCalledTimes(2);
  });
});

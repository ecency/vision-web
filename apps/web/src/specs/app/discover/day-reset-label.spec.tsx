import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import i18next from "i18next";
import { renderToString } from "react-dom/server";
import { DayResetLabel, timeUntilUtcReset } from "@/app/discover/_components/day-reset-label";

const at = (iso: string) => new Date(iso).getTime();

describe("timeUntilUtcReset", () => {
  it("counts down to the next 00:00 UTC", () => {
    expect(timeUntilUtcReset(at("2026-10-30T18:48:00Z"))).toEqual({ hours: 5, minutes: 12 });
  });

  it("rounds a part minute up, so the last minute never reads 0h 0m", () => {
    expect(timeUntilUtcReset(at("2026-10-30T23:59:30Z"))).toEqual({ hours: 0, minutes: 1 });
  });

  it("is a full day right at the reset", () => {
    expect(timeUntilUtcReset(at("2026-10-30T00:00:00Z"))).toEqual({ hours: 24, minutes: 0 });
  });

  it("does not depend on the viewer's time zone", () => {
    // 01:30 in Berlin on 10-31 is still 23:30 UTC on 10-30
    expect(timeUntilUtcReset(at("2026-10-31T01:30:00+02:00"))).toEqual({ hours: 0, minutes: 30 });
  });
});

describe("DayResetLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(i18next.t).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the UTC day and the time left", () => {
    vi.setSystemTime(new Date("2026-10-30T18:48:00Z"));
    render(<DayResetLabel />);

    expect(screen.getByText("leaderboard.day-resets-in")).toBeInTheDocument();
    expect(i18next.t).toHaveBeenCalledWith("leaderboard.day-resets-in", { hours: 5, minutes: 12 });
  });

  it("keeps counting while the page stays open", () => {
    vi.setSystemTime(new Date("2026-10-30T18:48:00Z"));
    render(<DayResetLabel />);

    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000);
    });

    expect(i18next.t).toHaveBeenLastCalledWith("leaderboard.day-resets-in", { hours: 4, minutes: 12 });
  });

  it("puts no time in the server HTML, which can be served later from a cache", () => {
    vi.setSystemTime(new Date("2026-10-30T18:48:00Z"));
    const html = renderToString(<DayResetLabel />);

    expect(html).not.toContain("leaderboard.day-resets-in");
    expect(i18next.t).not.toHaveBeenCalled();
  });

  it("tells the page once when the UTC day changes, so it can load the new board", () => {
    vi.setSystemTime(new Date("2026-10-30T23:58:30Z"));
    const onDayChange = vi.fn();
    render(<DayResetLabel onDayChange={onDayChange} />);

    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });
    expect(onDayChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });
    expect(onDayChange).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });
    expect(onDayChange).toHaveBeenCalledTimes(1);
  });

  it("fires the day change at 00:00:00 UTC, not up to a minute later", () => {
    vi.setSystemTime(new Date("2026-10-30T23:59:30Z"));
    const onDayChange = vi.fn();
    render(<DayResetLabel onDayChange={onDayChange} />);

    act(() => {
      vi.advanceTimersByTime(29_999);
    });
    expect(onDayChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDayChange).toHaveBeenCalledTimes(1);
    expect(i18next.t).toHaveBeenLastCalledWith("leaderboard.day-resets-in", { hours: 24, minutes: 0 });
  });
});

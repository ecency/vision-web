import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { msToNextChange, useAdventVisible } from "@/features/advent/use-advent-visible";

const notFound = vi.hoisted(() => vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
}));
vi.mock("next/navigation", async () => ({ ...(await vi.importActual("next/navigation")), notFound }));
vi.mock("@/app/advent/_page", () => ({ AdventPage: () => null }));
vi.mock("@/features/metadata", () => ({ PagesMetadataGenerator: { getForPage: vi.fn() } }));

import Page from "@/app/advent/page";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Advent nav item and page by date", () => {
  it("shows the nav item from 25 Nov and hides it on 1 Jan, at the moment itself", () => {
    vi.setSystemTime(Date.UTC(2026, 10, 24, 23, 59, 30));
    const { result } = renderHook(() => useAdventVisible());
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(31_000));
    expect(result.current).toBe(true);
    vi.setSystemTime(Date.UTC(2026, 11, 31, 23, 59, 50));
    act(() => vi.advanceTimersByTime(0));
    // the next change is the hide moment, waited for directly
    expect(msToNextChange(Date.UTC(2026, 11, 31, 23, 59, 50))).toBe(10_000);
    expect(msToNextChange(Date.UTC(2027, 0, 2))).toBeNull();
  });

  it("is a 404 before 25 November and from 1 January, and renders in between", () => {
    vi.setSystemTime(Date.UTC(2026, 10, 24, 12));
    expect(() => Page()).toThrow("NEXT_NOT_FOUND");
    vi.setSystemTime(Date.UTC(2026, 10, 25, 0, 0, 1));
    expect(() => Page()).not.toThrow();
    vi.setSystemTime(Date.UTC(2027, 0, 1, 0, 0, 1));
    expect(() => Page()).toThrow("NEXT_NOT_FOUND");
    vi.setSystemTime(Date.UTC(2026, 11, 6, 12));
    expect(() => Page()).not.toThrow();
  });
});

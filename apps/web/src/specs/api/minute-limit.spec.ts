// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { minuteLimit } from "@/server/minute-limit";

const NOW = Date.parse("2026-10-10T12:00:00Z");
// The limit is timed by the running time of the process: this moves it on.
const later = (ms: number) => vi.advanceTimersByTime(ms);

describe("a limit per minute for each key", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "performance"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lets a key go ahead so many times a minute, each key by itself", () => {
    const mayAsk = minuteLimit(3);
    expect([1, 2, 3, 4, 5].map(() => mayAsk("ann"))).toEqual([true, true, true, false, false]);
    // another key is not held up by it
    expect(mayAsk("bob")).toBe(true);
    // nor is another limit
    expect(minuteLimit(3)("ann")).toBe(true);
  });

  it("counts the last minute, not minutes of the clock", () => {
    const mayAsk = minuteLimit(2);
    expect(mayAsk("ann")).toBe(true);
    later(40_000);
    expect(mayAsk("ann")).toBe(true);
    expect(mayAsk("ann")).toBe(false);
    // just short of a minute after the first use: no room yet
    later(19_999);
    expect(mayAsk("ann")).toBe(false);
    // the first use is a minute old: room for one, not for two
    later(1);
    expect(mayAsk("ann")).toBe(true);
    expect(mayAsk("ann")).toBe(false);
    later(40_000);
    expect(mayAsk("ann")).toBe(true);
  });

  it("does not count a refused use, so asking on does not push the wait out", () => {
    const mayAsk = minuteLimit(1);
    expect(mayAsk("ann")).toBe(true);
    for (let s = 10; s < 60; s += 10) {
      later(10_000);
      expect(mayAsk("ann")).toBe(false);
    }
    later(10_000);
    expect(mayAsk("ann")).toBe(true);
  });

  it("still tells keys apart after a great many of them", () => {
    const mayAsk = minuteLimit(1);
    for (let i = 0; i < 1500; i++) expect(mayAsk(`key${i}`)).toBe(true);
    // used within the minute: still refused, whatever was forgotten meanwhile
    expect(mayAsk("key1499")).toBe(false);
    expect(mayAsk("key0")).toBe(false);
    later(61_000);
    for (let i = 0; i < 1500; i++) expect(mayAsk(`again${i}`)).toBe(true);
    expect(mayAsk("key0")).toBe(true);
  });

  it("is not put off by the clock being set back", () => {
    const mayAsk = minuteLimit(1);
    expect(mayAsk("ann")).toBe(true);
    // the clock on the wall goes back ten minutes; a minute passes
    vi.setSystemTime(NOW - 600_000);
    later(60_000);
    expect(mayAsk("ann")).toBe(true);
  });
});

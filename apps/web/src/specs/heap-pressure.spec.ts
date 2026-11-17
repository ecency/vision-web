// @vitest-environment node
import { describe, expect, it } from "vitest";
import { heapPressureLine, nextHeapMark } from "@/heap-pressure";

// #2043: replicas abort at the V8 heap cap under load, and the crashed
// container (with its fatal log) is pruned by the deploy job. The event-loop
// monitor now writes one line when the heap nears its limit, naming the
// renders in flight, so the next abort leaves something to read.

const MB = 1024 * 1024;
const active = (n: number, now: number) =>
  Array.from({ length: n }, (_, i) => ({ method: "GET", url: `/@a/p${i}`, startTime: now - i * 100 }));

describe("heapPressureLine", () => {
  const base = { limitBytes: 3072 * MB, containerTag: "web.1@host", now: 1_000_000, lastAt: 0, lastRatio: 0 };

  it("says nothing below 90% of the heap limit", () => {
    expect(heapPressureLine({ ...base, usedBytes: 2700 * MB, active: active(3, base.now) })).toBeNull();
  });

  it("reports heap use and the renders in flight, longest first, at 90% and above", () => {
    const line = heapPressureLine({ ...base, usedBytes: 2800 * MB, active: active(3, base.now) });
    expect(line).not.toBeNull();
    expect(line!.startsWith("[HeapPressure] ")).toBe(true);
    const data = JSON.parse(line!.slice("[HeapPressure] ".length));
    expect(data).toMatchObject({
      container: "web.1@host",
      heapUsedMb: 2800,
      heapLimitMb: 3072,
      ratio: 0.91,
      activeCount: 3
    });
    expect(data.active.map((r: { url: string }) => r.url)).toEqual(["/@a/p2", "/@a/p1", "/@a/p0"]);
    expect(data.active[0].durationMs).toBe(200);
  });

  it("names at most 20 renders", () => {
    const data = JSON.parse(
      heapPressureLine({ ...base, usedBytes: 3000 * MB, active: active(50, base.now) })!.slice(15)
    );
    expect(data.activeCount).toBe(50);
    expect(data.active).toHaveLength(20);
  });

  it("writes at most one line a minute", () => {
    const hot = { ...base, usedBytes: 3000 * MB, active: active(1, base.now) };
    expect(heapPressureLine({ ...hot, lastAt: base.now - 30_000 })).toBeNull();
    expect(heapPressureLine({ ...hot, lastAt: base.now - 60_000 })).not.toBeNull();
  });

  it("stays quiet while the heap sits high, and speaks again when it climbs further", () => {
    // A replica parked above the threshold must not log every minute forever:
    // after a line, only a further climb of 2 points of the limit is news.
    const after = { ...base, lastAt: base.now - 120_000, lastRatio: 0.93, active: active(1, base.now) };
    expect(heapPressureLine({ ...after, usedBytes: 0.94 * 3072 * MB })).toBeNull();
    expect(heapPressureLine({ ...after, usedBytes: 0.95 * 3072 * MB })).not.toBeNull();
  });

  it("ignores a missing heap limit", () => {
    expect(heapPressureLine({ ...base, limitBytes: 0, usedBytes: 3000 * MB, active: [] })).toBeNull();
  });

  it("keeps the high-water mark while the heap swings around the threshold", () => {
    // used_heap_size includes uncollected garbage, so a replica near the cap
    // reads 0.87 after a collection and 0.92 before the next. Only a real drop
    // clears the mark; otherwise every swing would log again.
    expect(nextHeapMark(0.87, 0.93)).toBe(0.93);
    expect(nextHeapMark(0.84, 0.93)).toBe(0);
  });

  it("speaks again after ten minutes while still high, so the climb before an abort is on record", () => {
    const high = { ...base, usedBytes: 0.96 * 3072 * MB, active: active(1, base.now), lastRatio: 0.97 };
    expect(heapPressureLine({ ...high, lastAt: base.now - 5 * 60_000 })).toBeNull();
    expect(heapPressureLine({ ...high, lastAt: base.now - 10 * 60_000 })).not.toBeNull();
  });
});

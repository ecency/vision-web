/**
 * One log line when the V8 heap nears its limit (#2043).
 *
 * Replicas abort at the heap cap under load (exit 134), and the deploy job
 * prunes the crashed container, so its fatal log is lost. The event-loop
 * monitor calls this every sample; above HEAP_PRESSURE_RATIO it returns a line
 * with the heap figures and the renders in flight, longest first, so the next
 * abort leaves a record of what was rendering. Log-only: no heap snapshot,
 * which would pause the process and write gigabytes.
 *
 * Some replicas sit near their cap even at quiet hours, and `used_heap_size`
 * includes garbage not yet collected. So after a line, the heap has to climb
 * HEAP_PRESSURE_STEP more before the next one: a high-water mark, reset by the
 * caller once the heap drops back under the threshold. A replica parked high
 * stays quiet, and the lines that do appear lead up to an abort.
 */

export const HEAP_PRESSURE_RATIO = 0.9;
export const HEAP_PRESSURE_STEP = 0.02;
export const HEAP_PRESSURE_INTERVAL_MS = 60_000;
const MAX_ACTIVE = 20;

const MB = 1024 * 1024;

interface Active {
  method: string;
  url: string;
  startTime: number;
}

export function heapPressureLine(input: {
  usedBytes: number;
  limitBytes: number;
  active: Iterable<Active>;
  containerTag: string;
  now: number;
  /** When the last line was written; 0 if never. */
  lastAt: number;
  /** The ratio the last line reported; 0 if none since the heap was last under the threshold. */
  lastRatio: number;
}): string | null {
  const { usedBytes, limitBytes, containerTag, now, lastAt, lastRatio } = input;
  if (!(limitBytes > 0)) return null;
  const ratio = usedBytes / limitBytes;
  if (ratio < HEAP_PRESSURE_RATIO) return null;
  // The epsilon keeps 0.93 + 0.02 from landing a hair above 0.95 in floating point.
  if (lastRatio > 0 && ratio + 1e-9 < lastRatio + HEAP_PRESSURE_STEP) return null;
  if (lastAt > 0 && now - lastAt < HEAP_PRESSURE_INTERVAL_MS) return null;

  const all = Array.from(input.active).map((r) => ({
    method: r.method,
    url: r.url,
    durationMs: now - r.startTime
  }));
  all.sort((a, b) => b.durationMs - a.durationMs);

  return (
    "[HeapPressure] " +
    JSON.stringify({
      container: containerTag,
      heapUsedMb: Math.round(usedBytes / MB),
      heapLimitMb: Math.round(limitBytes / MB),
      ratio: Math.round(ratio * 100) / 100,
      activeCount: all.length,
      active: all.slice(0, MAX_ACTIVE)
    })
  );
}

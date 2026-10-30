"use client";

import { useEffect, useRef, useState } from "react";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The time, updated every minute, for anything tied to the 00:00 UTC reset (day
 * leaderboard, daily quests, free spin). `onDayChange` runs once when the UTC day
 * changes while the component is mounted, so it can reload what reset.
 *
 * Null until mounted: server HTML can be served later from a cache, so whatever
 * renders a time from this renders it from the browser's clock only.
 */
export function useUtcClock(onDayChange?: () => void): number | null {
  const [now, setNow] = useState<number | null>(null);
  const onDayChangeRef = useRef(onDayChange);

  useEffect(() => {
    onDayChangeRef.current = onDayChange;
  }, [onDayChange]);

  useEffect(() => {
    let day: number | null = null;
    const tick = () => {
      const t = Date.now();
      const today = Math.floor(t / DAY_MS);
      if (day !== null && today !== day) {
        onDayChangeRef.current?.();
      }
      day = today;
      setNow(t);
    };
    tick();
    const id = setInterval(tick, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return now;
}

"use client";

import i18next from "i18next";
import { useEffect, useState } from "react";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Hours and minutes until the next 00:00 UTC, when the day leaderboard, the daily
 * quests and the free spin reset. A part minute rounds up, so the last minute of the
 * day reads "0h 1m", never "0h 0m".
 */
export function timeUntilUtcReset(now: number): { hours: number; minutes: number } {
  const left = DAY_MS - (now % DAY_MS);
  const totalMinutes = Math.ceil(left / 60000);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

export function DayResetLabel() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return (
    // The minute can differ between the server render and the browser; the browser value wins.
    <div className="text-xs opacity-50" suppressHydrationWarning={true}>
      {i18next.t("leaderboard.day-resets-in", timeUntilUtcReset(now))}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import i18next from "i18next";
import { countdown } from "@/features/raidstead/game";

const t = (key: string, opts?: Record<string, unknown>) => i18next.t(`raidstead.${key}`, opts);

/// Before the first season: the start, ticking down each second over the live
/// scene. Calls `onOpen` once the moment has come. `skew` (ms) is the server's
/// clock minus this device's.
export function SeasonCountdown({ startsAt, skew = 0, onOpen }: { startsAt: string; skew?: number; onOpen: () => void }) {
  const at = Date.parse(startsAt);
  const [now, setNow] = useState(() => Date.now() + skew);
  const left = countdown(at, now);
  // once per start: a clock correction while it waits must not call it again
  const openedFor = useRef<number | null>(null);

  useEffect(() => {
    if (left.done) {
      if (openedFor.current !== at) {
        openedFor.current = at;
        onOpen();
      }
      return;
    }
    const id = setInterval(() => setNow(Date.now() + skew), 1000);
    return () => clearInterval(id);
  }, [left.done, onOpen, skew, at]);

  const when = new Date(at).toLocaleString(i18next.language || undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  const units = [
    [left.days, t("season.countdown-days")],
    [left.hours, t("season.countdown-hours")],
    [left.minutes, t("season.countdown-minutes")],
    [left.seconds, t("season.countdown-seconds")]
  ] as const;

  return (
    <section className="rs-card rs-plate rs-countdown" aria-labelledby="rs-countdown-title">
      <h2 id="rs-countdown-title" className="rs-plate-name">
        {t("season.countdown-title", { n: 1 })}
      </h2>
      {/* the numbers change every second: read once, not announced on every tick */}
      <div className="rs-clock" role="timer" aria-live="off">
        {units.map(([n, label]) => (
          <span key={label} className="rs-clock-unit">
            <b>{String(n).padStart(2, "0")}</b> <small>{label}</small>
          </span>
        ))}
      </div>
      <p className="rs-muted">
        {left.done ? t("season.countdown-opening") : t("season.countdown-when", { date: when })}
      </p>
      <p className="rs-muted">{t("season.not-started-hint")}</p>
    </section>
  );
}

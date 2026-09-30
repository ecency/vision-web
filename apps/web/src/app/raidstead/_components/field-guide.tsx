"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import i18next from "i18next";
import { drawPortrait, FOLK, type Calendar } from "@ecency/raidstead";
import { pestCalendar } from "@/features/raidstead/game";
import { Sheet } from "./sheets";

const t = (key: string, values?: Record<string, unknown>) => i18next.t(`raidstead.${key}`, values);

/// One model printed still on a small canvas. Decorative: the name next to it says who it is.
function Portrait({
  kind,
  silhouette = false,
  className
}: {
  kind: string;
  silhouette?: boolean;
  className: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const draw = () => {
      // drawn at the size the card gives it, which is only known once the sheet is open
      if (!c.clientWidth) return;
      try {
        drawPortrait(c, kind, { silhouette });
      } catch {
        // no 2D canvas (an old browser, a test DOM): the text carries the card on its own
      }
    };
    draw();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [kind, silhouette]);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}

// each step shows the townsfolk who does it
const STEPS = [
  { key: "pick", folk: "herald" },
  { key: "scout", folk: "scout" },
  { key: "attack", folk: "scribe" },
  { key: "build", folk: "smith" }
] as const;

/// The rules, the season's pests and the townsfolk on one card. Before the first
/// season it also says how to get ready. A pest that has not arrived yet shows as
/// a silhouette with its name and trick: what it looks like is kept for its week.
export function FieldGuideSheet({
  calendar,
  onClose
}: {
  calendar: Pick<Calendar, "season" | "week" | "resting" | "startsAt">;
  onClose: () => void;
}) {
  const preseason = calendar.season < 1;
  const weeks = pestCalendar(calendar);
  const date = (at: number) =>
    // the day a pest arrives is a UTC day, like every day in the game
    new Date(at).toLocaleDateString(i18next.language || undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC"
    });

  return (
    <Sheet onClose={onClose} label={t("guide.title")}>
      <small>{t("tagline")}</small>
      <h2>{t("guide.title")}</h2>
      <p>{t("intro")}</p>

      <h3>{t("guide.steps-title")}</h3>
      <ol className="rs-steps">
        {STEPS.map((s, i) => (
          <li key={s.key}>
            <Portrait kind={s.folk} className="rs-steps-art" />
            <span>
              <b>
                {i + 1}. {t(`guide.step-${s.key}`)}
              </b>
              <span className="rs-muted">{t(`guide.step-${s.key}-desc`)}</span>
            </span>
          </li>
        ))}
      </ol>

      <h3>{t("guide.pests-title", { n: Math.max(1, calendar.season) })}</h3>
      <ul className="rs-pests">
        {weeks.map((w) => (
          <li key={w.week} className={w.revealed ? undefined : "is-hidden"}>
            <Portrait kind={w.kind} silhouette={!w.revealed} className="rs-pests-art" />
            <small>{t("guide.pest-week", { week: w.week, date: date(w.at) })}</small>
            <b>{t(`bosses.${w.kind}.name`)}</b>
            <span className="rs-muted">{t(`bosses.${w.kind}.trick`)}</span>
            {!w.revealed && (
              <span className="rs-pests-soon">{t("guide.pest-hidden", { date: date(w.at) })}</span>
            )}
          </li>
        ))}
      </ul>
      {weeks.some((w) => !w.revealed) && <p className="rs-muted">{t("guide.pests-note")}</p>}

      <h3>{t("guide.folk-title")}</h3>
      <ul className="rs-folk">
        {FOLK.map((f) => (
          <li key={f}>
            <Portrait kind={f} className="rs-folk-art" />
            <span>
              <b>{t(`heroes.${f}`)}</b>
              <span className="rs-muted">{t(`hero-card.${f}`)}</span>
            </span>
          </li>
        ))}
      </ul>

      <h3>{t("guide.energy-title")}</h3>
      <ul>
        <li>{t("guide.energy")}</li>
        <li>{t("guide.chest")}</li>
      </ul>

      <h3>{t("guide.keep-title")}</h3>
      <p>{t("guide.keep")}</p>

      {preseason && (
        <>
          <h3>{t("guide.ready-title")}</h3>
          <ul>
            <li>
              {t("guide.ready-community")}{" "}
              <Link className="rs-guide-link" href="/communities" onClick={onClose}>
                {t("alliance.browse")}
              </Link>
            </li>
            <li>
              {t("guide.ready-quests")}{" "}
              <Link className="rs-guide-link" href="/perks" onClick={onClose}>
                {t("guide.ready-quests-link")}
              </Link>
            </li>
            <li>{t("guide.ready-friends")}</li>
          </ul>
        </>
      )}

      <div className="rs-btns">
        <button className="rs-btn rs-primary" onClick={onClose}>
          {preseason ? t("guide.close-preseason") : t("guide.close")}
        </button>
      </div>
    </Sheet>
  );
}

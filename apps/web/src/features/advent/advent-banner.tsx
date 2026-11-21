"use client";

import Link from "next/link";
import i18next from "i18next";
import { useEffect, useState } from "react";
import { UilTimes } from "@tooni/iconscout-unicons-react";
import * as ls from "@/utils/local-storage";
import { adventPhase, todayDoor } from "./season";
import { Sky, useSnowSwitch } from "./sky";
import "./advent.scss";

const DISMISSED_KEY = "advent_banner_closed";
const ANSWERED_KEY = "advent_answered_on";

/// The UTC date, the day a door and the banner run by.
const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/// Today's door is answered in this browser: the banner rests until tomorrow.
export function markAnsweredToday() {
  ls.set(ANSWERED_KEY, utcDay(Date.now()));
}

/// An invitation at the top of the feed, from 29 November to 31 December. It
/// shows once a day until the reader closes it or answers that day's door.
export function AdventBanner() {
  // decided in the browser: the date is the reader's now, never a cached page's
  const [show, setShow] = useState<"teaser" | "results" | number | null>(null);
  const [snow] = useSnowSwitch();

  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const phase = adventPhase(now);
      const day = utcDay(now);
      const door = todayDoor(now);
      if (phase === "hidden" || ls.get(DISMISSED_KEY) === day || ls.get(ANSWERED_KEY) === day) {
        setShow(null);
        return;
      }
      // after door 24, to 31 December: an invitation to the results and the grand draw
      setShow(phase === "teaser" ? "teaser" : door ?? "results");
    };
    check();
    // a feed left open over midnight (UTC), or a door answered in another tab
    const id = setInterval(check, 60_000);
    addEventListener("storage", check);
    return () => {
      clearInterval(id);
      removeEventListener("storage", check);
    };
  }, []);

  if (show === null) return null;

  const close = () => {
    ls.set(DISMISSED_KEY, utcDay(Date.now()));
    setShow(null);
  };

  return (
    <div className="advent">
      <Sky className="adv-banner" bulbs={14} snow={snow}>
        <button type="button" className="adv-banner-close" aria-label={i18next.t("g.close")} onClick={close}>
          <UilTimes className="size-4" aria-hidden />
        </button>
        <div className="adv-banner-in">
          <span>
            <b className="adv-banner-title">{i18next.t("advent.title")}</b>
            {show === "teaser"
              ? i18next.t("advent.banner-teaser")
              : show === "results"
                ? i18next.t("advent.banner-results")
                : i18next.t("advent.banner-door", { day: show })}
          </span>
          <Link href="/advent" className="adv-btn gold">
            {show === "teaser"
              ? i18next.t("advent.banner-teaser-cta")
              : show === "results"
                ? i18next.t("advent.banner-results-cta")
                : i18next.t("advent.banner-door-cta", { day: show })}
          </Link>
        </div>
      </Sky>
    </div>
  );
}

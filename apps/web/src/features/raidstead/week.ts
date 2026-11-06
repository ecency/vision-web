import { useEffect, useRef, useState } from "react";
import { createApi, type League, type WeekKill } from "@ecency/raidstead";
import { RAIDSTEAD_API } from "./api-base";
import { alliancesOfWeek } from "./game";

export interface WeekWinners {
  season: number;
  week: number;
  winners: Partial<Record<League, WeekKill>>;
}

// public: no session needed, so community pages ask without the game's client
const api = createApi({ base: RAIDSTEAD_API, token: () => null });

// One ask per page, shared by everything on it that shows the winners. A failure
// (a server without the route, a 4xx, offline) counts as none. An answer is kept
// at most an hour and never past the next UTC midnight, when raid days (and so
// weeks) end; one asked in the first minutes of a day may still be the server's
// cached last one, so it is kept only until those minutes are over.
const KEEP_MS = 3_600_000;
const SETTLE_MS = 180_000;
const DAY_MS = 86_400_000;
// behind: the server answered, but not yet for the week asked for
interface Asked { w: WeekWinners | null; behind: boolean }
let asked: { until: number; want?: string; answer: Promise<Asked> } | null = null;

function keepUntil(now: number): number {
  const midnight = Math.floor(now / DAY_MS) * DAY_MS;
  if (now < midnight + SETTLE_MS) return midnight + SETTLE_MS;
  return Math.min(now + KEEP_MS, midnight + DAY_MS);
}

/// `want`: "season:week" of the week the caller knows has finished (week 0: none
/// yet). A kept answer for another week is not used; an answer that is not yet
/// for that week (the server still caching the one before) is kept a minute only.
export function weekWinners(want?: string): Promise<WeekWinners | null> {
  return ask(want).then((a) => a.w);
}

function ask(want?: string): Promise<Asked> {
  const now = Date.now();
  if (!asked || now >= asked.until || (want !== undefined && asked.want !== want)) {
    const entry: { until: number; want?: string; answer: Promise<Asked> } = {
      until: keepUntil(now),
      want,
      answer: Promise.resolve({ w: null, behind: false })
    };
    entry.answer = api
      .week()
      .then((r) => {
        const behind = want !== undefined && !!r && `${r.season}:${r.week}` !== want;
        if (behind) entry.until = Math.min(entry.until, Date.now() + 60_000);
        // week 0: no week has finished yet
        const w = r && r.week >= 1 && Array.isArray(r.kills)
          ? { season: r.season, week: r.week, winners: alliancesOfWeek(r.kills) }
          : null;
        return { w, behind };
      })
      .catch(() => ({ w: null, behind: false }));
    asked = entry;
  }
  return asked.answer;
}

/// For specs: the next ask goes to the server again.
export function forgetWeekWinners() {
  asked = null;
}

/// Last finished week's Alliance of the Week in each league; null while unknown or
/// when there is none. `want` (see weekWinners) makes an open page ask again when
/// the finished week changes, and a minute later while the answer is not yet for it.
export function useWeekWinners(want?: string): WeekWinners | null {
  const [winners, setWinners] = useState<WeekWinners | null>(null);
  const [again, setAgain] = useState(0);
  const tries = useRef({ want, n: 0 });
  useEffect(() => {
    if (tries.current.want !== want) tries.current = { want, n: 0 };
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    ask(want).then(({ w, behind }) => {
      if (!live) return;
      setWinners(w);
      // the server still had the week before: a few more asks, a minute apart
      // (never after a failure or a missing route)
      if (behind && tries.current.n < 5) {
        tries.current.n++;
        timer = setTimeout(() => setAgain((n) => n + 1), 61_000);
      }
    });
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [want, again]);
  return winners;
}

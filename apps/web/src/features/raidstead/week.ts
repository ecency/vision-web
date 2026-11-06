import { useEffect, useState } from "react";
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
// (a server without the route, a 4xx, offline) counts as none and is not asked
// again until it is an hour old: a later visit may find them.
const KEEP_MS = 3_600_000;
let asked: { at: number; answer: Promise<WeekWinners | null> } | null = null;

export function weekWinners(): Promise<WeekWinners | null> {
  if (!asked || Date.now() - asked.at > KEEP_MS) {
    asked = {
      at: Date.now(),
      answer: api
        .week()
        .then((r) =>
          // week 0: no week has finished yet
          r && r.week >= 1 && Array.isArray(r.kills)
            ? { season: r.season, week: r.week, winners: alliancesOfWeek(r.kills) }
            : null
        )
        .catch(() => null)
    };
  }
  return asked.answer;
}

/// For specs: the next ask goes to the server again.
export function forgetWeekWinners() {
  asked = null;
}

/// Last finished week's Alliance of the Week in each league; null while unknown or when there is none.
export function useWeekWinners(): WeekWinners | null {
  const [winners, setWinners] = useState<WeekWinners | null>(null);
  useEffect(() => {
    let live = true;
    weekWinners().then((w) => live && setWinners(w));
    return () => {
      live = false;
    };
  }, []);
  return winners;
}

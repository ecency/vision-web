// The Advent Calendar follows the date alone: no flag and no deploy turns it
// on or off. All times are UTC, the clock the doors and draws run on.

export const ADVENT_SEASON = 2026;
/// The page, nav item and feed banner show themselves from here (a teaser)...
export const ADVENT_SHOW_FROM = Date.UTC(2026, 10, 25);
/// ...the first door opens here...
export const ADVENT_FIRST_DOOR = Date.UTC(2026, 11, 1);
/// ...and everything hides itself again from here. The games API stays up; it
/// does nothing after the season.
export const ADVENT_HIDE_AT = Date.UTC(2027, 0, 1);
export const ADVENT_DOORS = 24;

export type AdventPhase = "hidden" | "teaser" | "season";

export function adventPhase(now: number): AdventPhase {
  if (now < ADVENT_SHOW_FROM || now >= ADVENT_HIDE_AT) return "hidden";
  return now < ADVENT_FIRST_DOOR ? "teaser" : "season";
}

/// The door that opens today (UTC), or null outside 1 to 24 December.
export function todayDoor(now: number): number | null {
  if (now < ADVENT_FIRST_DOOR) return null;
  const day = Math.floor((now - ADVENT_FIRST_DOOR) / 86_400_000) + 1;
  return day <= ADVENT_DOORS ? day : null;
}

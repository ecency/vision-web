import { ADVENT_SEASON } from "./season";

/// The Advent page's cache keys, in one place: the season with the reader's
/// part (per account, none when signed out), and the grand draw.
export const AdventQueryKeys = {
  all: ["advent"] as const,
  season: (account: string | null) => ["advent", ADVENT_SEASON, "season", account] as const,
  seasonAll: () => ["advent", ADVENT_SEASON, "season"] as const,
  grand: () => ["advent", ADVENT_SEASON, "grand"] as const
};

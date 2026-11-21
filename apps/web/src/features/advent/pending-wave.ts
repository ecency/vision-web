import * as ls from "@/utils/local-storage";
import { ADVENT_SEASON } from "./season";

// A Wave that was published but not yet linked to its answer on the games API.
// Kept in this browser until linking succeeds, so reopening the door links the
// same Wave again instead of publishing a second one.
const key = (account: string, day: number) => `advent_wave_pending_${ADVENT_SEASON}_${account}_${day}`;

export const pendingWave = (account: string, day: number): string | null => {
  const v = ls.get(key(account, day));
  return typeof v === "string" && v ? v : null;
};
export const keepPendingWave = (account: string, day: number, permlink: string) => ls.set(key(account, day), permlink);
export const clearPendingWave = (account: string, day: number) => ls.remove(key(account, day));

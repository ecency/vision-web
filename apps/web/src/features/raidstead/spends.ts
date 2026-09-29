import { spendKey } from "@ecency/raidstead";
import * as ls from "@/utils/local-storage";

const SPENDS_KEY = "raidstead_pending_spends";
type PendingSpends = Record<string, { key: string; season: number }>;

/// The key for a Points spend, kept until games-api has answered for it, for
/// as long as it takes: across reloads, days and hours. A spend whose answer
/// was lost is therefore always retried with the same key, and games-api
/// answers "already applied" instead of charging again (the page then says so
/// and the next tap is a new spend). games-api scopes keys to the season, so a
/// key left from an earlier season is dropped.
const spendId = (account: string, which: string) => `${account}:${which}`;

export function pendingSpendKey(account: string, which: string, season: number): string {
  // no season known yet: a one-off key, and the pending ones stay untouched
  if (!season) return spendKey();
  const all = (ls.get(SPENDS_KEY) ?? {}) as PendingSpends;
  for (const [id, p] of Object.entries(all)) if (p?.season !== season) delete all[id];
  const id = spendId(account, which);
  const p = all[id];
  if (p && typeof p.key === "string") return p.key;
  const key = spendKey();
  ls.set(SPENDS_KEY, { ...all, [id]: { key, season } });
  return key;
}

export function settleSpend(account: string, which: string) {
  const all = (ls.get(SPENDS_KEY) ?? {}) as PendingSpends;
  delete all[spendId(account, which)];
  if (Object.keys(all).length) ls.set(SPENDS_KEY, all);
  else ls.remove(SPENDS_KEY);
}

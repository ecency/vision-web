import { spendKey } from "@ecency/raidstead";
import * as ls from "@/utils/local-storage";

const SPENDS_KEY = "raidstead_pending_spends";
const SPEND_TTL = 3_600_000;
type PendingSpends = Record<string, { key: string; at: number }>;

/// The key for a Points spend, kept until games-api has answered for it. It
/// survives a reload, so a spend whose answer was lost is retried with the
/// same key and games-api refuses to charge it twice. A new game day (00:00
/// UTC) or an hour later, it is taken for a new spend.
const spendId = (account: string, which: string) =>
  `${account}:${which}:${new Date().toISOString().slice(0, 10)}`;

export function pendingSpendKey(account: string, which: string): string {
  const all = (ls.get(SPENDS_KEY) ?? {}) as PendingSpends;
  const id = spendId(account, which);
  const p = all[id];
  if (p && typeof p.key === "string" && Date.now() - p.at < SPEND_TTL) return p.key;
  const key = spendKey();
  ls.set(SPENDS_KEY, { ...all, [id]: { key, at: Date.now() } });
  return key;
}

export function settleSpend(account: string, which: string) {
  const all = (ls.get(SPENDS_KEY) ?? {}) as PendingSpends;
  delete all[spendId(account, which)];
  if (Object.keys(all).length) ls.set(SPENDS_KEY, all);
  else ls.remove(SPENDS_KEY);
}

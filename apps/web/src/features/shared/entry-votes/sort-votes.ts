import type { Vote } from "@/entities";

export type VoteSortOption = "reward" | "timestamp" | "voter" | "percent" | "reputation";

/**
 * The votes dialog's order: descending by the chosen key. Rows without the
 * key (database_api rows carry no reputation) go last; ties, and those rows,
 * are ordered by voter, so the order never depends on the input order.
 */
export function sortVotes<T extends Vote>(votes: T[], sort: VoteSortOption): T[] {
  return [...votes].sort((a, b) => {
    const keyA = (a as Record<string, unknown>)[sort] as number | string | undefined;
    const keyB = (b as Record<string, unknown>)[sort] as number | string | undefined;
    const missingA = keyA === undefined || keyA === null;
    const missingB = keyB === undefined || keyB === null;
    if (missingA !== missingB) return missingA ? 1 : -1;
    if (!missingA && !missingB) {
      if (keyA! > keyB!) return -1;
      if (keyA! < keyB!) return 1;
    }
    return a.voter < b.voter ? -1 : a.voter > b.voter ? 1 : 0;
  });
}

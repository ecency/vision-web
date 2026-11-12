import { QueryKeys } from "@/modules/core";
import { queryOptions } from "@tanstack/react-query";
import { Entry, ObserverVote, Vote } from "../types";
import { callRPC, callRPCWithFallback } from "@/modules/core/hive-tx";

/** Page size of `bridge.list_votes` (the method accepts 1-1000). */
export const LIST_VOTES_PAGE_SIZE = 1000;

/** Upper bound on pages for one post, so a misbehaving relay cannot loop. */
const MAX_LIST_VOTES_PAGES = 100;

/**
 * Every vote on a post. Pages `bridge.list_votes` (`start` = the last voter of
 * the previous page, exclusive) until a short page. A node without it answers
 * through `condenser_api.get_active_votes`, which returns the whole list in
 * one go, and paging stops there. Paging also stops on a page that brings no
 * new voter: a cache may answer `list_votes` with the full v1 list.
 */
export async function getEntryVotes(
  author: string,
  permlink: string,
  signal?: AbortSignal
): Promise<Vote[]> {
  const votes: Vote[] = [];
  const seen = new Set<string>();
  let start: string | undefined;

  for (let page = 0; page < MAX_LIST_VOTES_PAGES; page++) {
    const params: Record<string, unknown> = { author, permlink, limit: LIST_VOTES_PAGE_SIZE };
    if (start !== undefined) params.start = start;
    const { result, method } = await callRPCWithFallback<Vote[] | null>(
      { method: "bridge.list_votes", params },
      { method: "condenser_api.get_active_votes", params: [author, permlink] },
      { signal }
    );
    const rows = Array.isArray(result) ? result : [];
    let added = 0;
    for (const row of rows) {
      if (!row || typeof row.voter !== "string" || seen.has(row.voter)) continue;
      seen.add(row.voter);
      votes.push(row);
      added++;
    }
    if (method !== "bridge.list_votes" || rows.length < LIST_VOTES_PAGE_SIZE || added === 0) {
      break;
    }
    start = rows[rows.length - 1].voter;
  }
  return votes;
}

/**
 * The full voter list of an entry, for the votes dialog. Entries no longer
 * carry it (bridge v2), and v1 lists stopped at 1000.
 */
export function getEntryActiveVotesQueryOptions(entry?: Pick<Entry, "author" | "permlink">) {
  return queryOptions({
    queryKey: QueryKeys.posts.entryActiveVotes(entry?.author, entry?.permlink),
    queryFn: async ({ signal }) => getEntryVotes(entry!.author, entry!.permlink, signal),
    enabled: !!entry,
  });
}

interface DatabaseVote {
  voter: string;
  author: string;
  permlink: string;
  rshares: number | string;
  vote_percent: number;
}

/**
 * One account's vote on one entry: `{ rshares, percent }`, or null when the
 * account has not voted (a removed vote, percent 0, is null too). One cheap
 * `database_api.list_votes` lookup by (author, permlink, voter), served by
 * every node. Use it when the entry was read for another observer, e.g. the
 * server-rendered default observer while a user is logged in
 * (`entryVoteOf` returns undefined then).
 */
export async function getEntryVote(
  author: string,
  permlink: string,
  voter: string,
  signal?: AbortSignal
): Promise<ObserverVote | null> {
  const response = await callRPC<{ votes?: DatabaseVote[] }>(
    "database_api.list_votes",
    { start: [author, permlink, voter], limit: 1, order: "by_comment_voter" },
    undefined,
    undefined,
    signal
  );
  const row = response?.votes?.[0];
  if (!row || row.author !== author || row.permlink !== permlink || row.voter !== voter) {
    return null;
  }
  const percent = Number(row.vote_percent) || 0;
  if (percent === 0) return null;
  return { rshares: Number(row.rshares) || 0, percent };
}

export function getEntryVoteQueryOptions(
  author: string | undefined,
  permlink: string | undefined,
  voter: string | undefined,
  enabled = true
) {
  return queryOptions({
    queryKey: QueryKeys.posts.entryVote(author, permlink, voter),
    queryFn: async ({ signal }) => getEntryVote(author!, permlink!, voter!, signal),
    enabled: enabled && !!author && !!permlink && !!voter,
    staleTime: 5 * 60_000,
  });
}

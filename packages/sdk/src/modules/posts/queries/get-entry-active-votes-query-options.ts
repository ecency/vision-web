import { getQueryClient, QueryKeys } from "@/modules/core";
import { isCastVote } from "../utils/normalize-entry";
import { queryOptions } from "@tanstack/react-query";
import { Entry, ObserverVote, Vote } from "../types";
import { callRPC, callRPCBatch, callRPCWithFallback } from "@/modules/core/hive-tx";

/** Page size of `bridge.list_votes` and `database_api.list_votes` (both accept up to 1000). */
export const LIST_VOTES_PAGE_SIZE = 1000;

/** Upper bound on pages for one post, so a misbehaving node or relay cannot loop. */
const MAX_LIST_VOTES_PAGES = 100;

/** A row of `database_api.list_votes`. It has no reputation. */
interface DatabaseVote {
  voter: string;
  author: string;
  permlink: string;
  rshares: number | string;
  vote_percent: number;
  weight?: number | string;
  last_update?: string;
}

function databaseListVotesParams(author: string, permlink: string, start: string, limit: number) {
  return { start: [author, permlink, start], limit, order: "by_comment_voter" };
}

/** A database_api row in the `Vote` shape (no reputation: that index has none). */
function fromDatabaseVote(row: DatabaseVote): Vote {
  return {
    voter: row.voter,
    rshares: Number(row.rshares) || 0,
    percent: Number(row.vote_percent) || 0,
    weight: Number(row.weight) || 0,
    time: row.last_update ?? "",
  };
}

/**
 * Every vote on a post from `database_api.list_votes` (order by_comment_voter),
 * which every node serves. The start key is INCLUSIVE, so each page after the
 * first repeats the previous page's last voter, which is skipped. The index
 * runs on past this post into the next one, so a row for another post ends
 * the list. `firstPage` is the first page when it is already in hand.
 */
async function getEntryVotesFromDatabase(
  author: string,
  permlink: string,
  signal?: AbortSignal,
  firstPage?: DatabaseVote[]
): Promise<Vote[]> {
  const votes: Vote[] = [];
  const seen = new Set<string>();
  let start = "";
  let page = firstPage;
  for (let n = 0; n < MAX_LIST_VOTES_PAGES; n++) {
    if (!page) {
      const response = await callRPC<{ votes?: DatabaseVote[] }>(
        "database_api.list_votes",
        databaseListVotesParams(author, permlink, start, LIST_VOTES_PAGE_SIZE),
        undefined,
        undefined,
        signal
      );
      page = Array.isArray(response?.votes) ? response.votes : [];
    }
    let added = 0;
    let ended = false;
    for (const row of page) {
      if (!row || row.author !== author || row.permlink !== permlink) {
        ended = true;
        break;
      }
      if (seen.has(row.voter)) continue;
      seen.add(row.voter);
      votes.push(fromDatabaseVote(row));
      added++;
    }
    if (ended || page.length < LIST_VOTES_PAGE_SIZE || added === 0) break;
    start = page[page.length - 1].voter;
    page = undefined;
  }
  return votes;
}

/**
 * Every vote on a post. Pages `bridge.list_votes` (`start` = the last voter of
 * the previous page, exclusive) until a short page. A node without it is
 * paged through `database_api.list_votes` instead (condenser
 * get_active_votes stops at 1000). The two lists are ordered differently, so
 * they are never combined: if the method changes after the first page, the
 * list is read again from the start through database_api. Paging also stops
 * on a page that brings no new voter (a cache may answer with a full list).
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
    const { result } = await callRPCWithFallback<unknown>(
      { method: "bridge.list_votes", params },
      {
        method: "database_api.list_votes",
        params: databaseListVotesParams(author, permlink, "", LIST_VOTES_PAGE_SIZE),
      },
      { signal }
    );
    // By SHAPE, not by the method that answered: a `{ votes }` body is a
    // database_api page (a node without list_votes, or a cache answering the
    // list_votes key with that body), an array is a list_votes page.
    const dbPage = (result as { votes?: unknown } | null)?.votes;
    if (!Array.isArray(result) && Array.isArray(dbPage)) {
      return getEntryVotesFromDatabase(
        author,
        permlink,
        signal,
        page === 0 ? (dbPage as DatabaseVote[]) : undefined
      );
    }
    if (!Array.isArray(result)) {
      // Neither a list_votes page nor a database_api body (null, {}): a failed
      // page, not an empty list. Read the list again from the start.
      return getEntryVotesFromDatabase(author, permlink, signal);
    }
    const rows = result as Vote[];
    let added = 0;
    for (const row of rows) {
      if (!row || typeof row.voter !== "string" || seen.has(row.voter)) continue;
      seen.add(row.voter);
      votes.push(row);
      added++;
    }
    if (rows.length < LIST_VOTES_PAGE_SIZE || added === 0) break;
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

// ── One account's vote, batched ──────────────────────────────────────────────

/** Lookups per JSON-RPC batch request. */
export const ENTRY_VOTE_BATCH_SIZE = 50;

interface LookupWaiter {
  resolve: (v: ObserverVote | null) => void;
  reject: (e: unknown) => void;
  signal?: AbortSignal;
}

interface PendingLookup {
  author: string;
  permlink: string;
  voter: string;
  waiters: LookupWaiter[];
}

function abortError(signal?: AbortSignal): unknown {
  if (signal?.reason !== undefined) return signal.reason;
  const e = new Error("The lookup was aborted");
  e.name = "AbortError";
  return e;
}

const isLive = (w: LookupWaiter) => !w.signal?.aborted;

/**
 * A signal that aborts once EVERY waiter of the chunk has cancelled, so a
 * batch nobody waits for any more is cancelled, while one caller leaving does
 * not cancel the others' lookups. Undefined when some waiter cannot cancel.
 */
function chunkSignal(chunk: PendingLookup[]): AbortSignal | undefined {
  const waiters = chunk.flatMap((l) => l.waiters);
  if (waiters.length === 0 || waiters.some((w) => !w.signal)) return undefined;
  const controller = new AbortController();
  const check = () => {
    if (waiters.every((w) => w.signal!.aborted)) controller.abort();
  };
  for (const w of waiters) w.signal!.addEventListener("abort", check, { once: true });
  check();
  return controller.signal;
}

let pendingLookups = new Map<string, PendingLookup>();
let flushScheduled = false;

/**
 * Read one `database_api.list_votes` row as `voter`'s vote on the post. The
 * method is a lower-bound seek on (author, permlink, voter): for an account
 * that did not vote it returns the NEXT row, another voter's or another
 * post's, so the row must match all three or it is "not voted". A removed
 * vote (percent 0) is "not voted" too.
 */
function readLookupRow(
  response: { votes?: DatabaseVote[] } | null | undefined,
  author: string,
  permlink: string,
  voter: string
): ObserverVote | null {
  const row = response?.votes?.[0];
  if (!row || row.author !== author || row.permlink !== permlink || row.voter !== voter) {
    return null;
  }
  const percent = Number(row.vote_percent) || 0;
  if (percent === 0) return null;
  return { rshares: Number(row.rshares) || 0, percent };
}

async function flushLookups(): Promise<void> {
  flushScheduled = false;
  // A lookup every caller of which has cancelled is not sent at all.
  const batch = [...pendingLookups.values()].filter((l) => l.waiters.some(isLive));
  pendingLookups = new Map();
  for (let i = 0; i < batch.length; i += ENTRY_VOTE_BATCH_SIZE) {
    const chunk = batch.slice(i, i + ENTRY_VOTE_BATCH_SIZE);
    try {
      const answers = await callRPCBatch<{ votes?: DatabaseVote[] }>(
        chunk.map((l) => ({
          method: "database_api.list_votes",
          params: databaseListVotesParams(l.author, l.permlink, l.voter, 1),
        })),
        { signal: chunkSignal(chunk) }
      );
      chunk.forEach((l, k) => {
        const answer = answers[k];
        if (answer && answer.error === undefined) {
          const vote = readLookupRow(answer.result, l.author, l.permlink, l.voter);
          l.waiters.forEach((w) => w.resolve(vote));
        } else {
          l.waiters.forEach((w) => w.reject(answer?.error ?? new Error("no answer")));
        }
      });
    } catch (e) {
      chunk.forEach((l) => l.waiters.forEach((w) => w.reject(e)));
    }
  }
}

/**
 * One account's vote on one entry: `{ rshares, percent }`, or null when the
 * account has not voted (a removed vote, percent 0, is null too). Lookups made
 * in the same tick (a page of cards mounting) are coalesced into ONE JSON-RPC
 * batch request, in chunks of 50, that fails over to another node as a unit;
 * the same lookup asked twice is sent once.
 */
export function getEntryVote(
  author: string,
  permlink: string,
  voter: string,
  signal?: AbortSignal
): Promise<ObserverVote | null> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    // A cancelled caller is released at once; its lookup is dropped or the
    // batch cancelled only when nobody else waits for it (see chunkSignal).
    signal?.addEventListener("abort", () => reject(abortError(signal)), { once: true });
    const key = `${author}\n${permlink}\n${voter}`;
    let lookup = pendingLookups.get(key);
    if (!lookup) {
      lookup = { author, permlink, voter, waiters: [] };
      pendingLookups.set(key, lookup);
    }
    lookup.waiters.push({ resolve, reject, signal });
    if (!flushScheduled) {
      flushScheduled = true;
      setTimeout(() => void flushLookups(), 0);
    }
  });
}

// ── Holding a vote this client just cast ─────────────────────────────────────

/** How long a vote this client cast outranks a disagreeing lookup. */
export const OPTIMISTIC_VOTE_HOLD_MS = 60_000;
/** When the one extra lookup runs after a disagreeing answer. */
export const OPTIMISTIC_VOTE_RECHECK_MS = 15_000;

const optimisticVotes = new Map<string, { vote: ObserverVote | null; at: number; recheck: boolean }>();
const voteKey = (author: string, permlink: string, voter: string) => `${author}\n${permlink}\n${voter}`;

/**
 * Record a vote this client just cast (or removed) on a post. The node
 * indexes that vote a block or more later, so for OPTIMISTIC_VOTE_HOLD_MS a
 * lookup that disagrees with it keeps this value, and one more lookup runs
 * OPTIMISTIC_VOTE_RECHECK_MS later. Called by the vote cache updates.
 */
export function recordOptimisticVote(
  author: string,
  permlink: string,
  voter: string,
  vote: ObserverVote | null
): void {
  optimisticVotes.set(voteKey(author, permlink, voter), { vote, at: Date.now(), recheck: false });
}

function sameVote(a: ObserverVote | null, b: ObserverVote | null): boolean {
  const castA = isCastVote(a);
  const castB = isCastVote(b);
  if (castA !== castB) return false;
  return !castA || a!.percent === b!.percent;
}

/** The chain's answer, unless a recent vote of this client says otherwise. */
function settleLookup(
  author: string,
  permlink: string,
  voter: string,
  chain: ObserverVote | null
): ObserverVote | null {
  const key = voteKey(author, permlink, voter);
  const held = optimisticVotes.get(key);
  if (!held) return chain;
  if (Date.now() - held.at >= OPTIMISTIC_VOTE_HOLD_MS || sameVote(chain, held.vote)) {
    optimisticVotes.delete(key);
    return chain;
  }
  if (!held.recheck) {
    held.recheck = true;
    setTimeout(() => {
      void getQueryClient().invalidateQueries({ queryKey: QueryKeys.posts.entryVote(author, permlink, voter) });
    }, OPTIMISTIC_VOTE_RECHECK_MS);
  }
  return held.vote;
}

export function getEntryVoteQueryOptions(
  author: string | undefined,
  permlink: string | undefined,
  voter: string | undefined,
  enabled = true
) {
  return queryOptions({
    queryKey: QueryKeys.posts.entryVote(author, permlink, voter),
    queryFn: async ({ signal }) =>
      settleLookup(author!, permlink!, voter!, await getEntryVote(author!, permlink!, voter!, signal)),
    enabled: enabled && !!author && !!permlink && !!voter,
    staleTime: 5 * 60_000,
  });
}

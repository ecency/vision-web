import type { Entry, ObserverVote } from "../types";

/**
 * The most voters a v1 bridge read puts in `active_votes`. A list this long
 * may be truncated, so an observer missing from it proves nothing.
 */
export const BRIDGE_V1_ACTIVE_VOTES_CAP = 1000;

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toObserverVote(value: unknown): ObserverVote | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { rshares?: unknown; percent?: unknown };
  return {
    rshares: toNumber(v.rshares),
    percent: v.percent === undefined || v.percent === null ? null : toNumber(v.percent)
  };
}

/**
 * Turn one bridge post, v1 or v2, into the SDK `Entry` shape. Pure: no I/O,
 * the input is not mutated, so it can run in a node script to produce golden
 * vectors for other clients.
 *
 * The decision is made from the SHAPE of `raw`, never from the method that
 * was called, because a cache in front of the nodes may answer a v2 request
 * with a v1 body:
 *
 * - `observer_vote` key present (v2): kept, numbers coerced; null stays null.
 * - else `active_votes` array present (v1): the observer's row becomes
 *   `{ rshares, percent: null }` (v1 rows carry no percent), absence becomes
 *   null. If the list may have been truncated (length >= 1000 and fewer rows
 *   than `stats.total_votes`) and the observer is not in it, the vote is
 *   UNKNOWN: `observer_vote` and `observer_vote_for` are left out.
 * - else (feeds such as esync or search rows): left out, unknown.
 *
 * `observer_vote_for` is set to `observer` whenever `observer_vote` is known,
 * so a consumer can tell whose vote it is. An empty observer never matches a
 * voter. `active_votes` is always removed; when a v1 row has no `stats`, the
 * count is taken from its length. Every other field passes through.
 */
export function normalizeEntry<T extends object>(raw: T, observer: string): Entry {
  if (!raw || typeof raw !== "object") return raw as unknown as Entry;

  const { active_votes: activeVotes, ...rest } = raw as Record<string, unknown> & {
    active_votes?: unknown;
  };
  const out: Record<string, unknown> = { ...rest };
  const who = typeof observer === "string" ? observer : "";

  if ("observer_vote" in raw) {
    out.observer_vote = toObserverVote((raw as { observer_vote?: unknown }).observer_vote);
    out.observer_vote_for = who;
  } else if (Array.isArray(activeVotes)) {
    const row = who
      ? (activeVotes as Array<{ voter?: unknown; rshares?: unknown; percent?: unknown }>).find(
          (v) => v && v.voter === who
        )
      : undefined;
    const stats = out.stats as { total_votes?: unknown } | null | undefined;
    const total = toNumber(stats?.total_votes);
    const truncated =
      activeVotes.length >= BRIDGE_V1_ACTIVE_VOTES_CAP && total > activeVotes.length;
    if (row) {
      out.observer_vote = toObserverVote({ rshares: row.rshares, percent: row.percent });
      out.observer_vote_for = who;
    } else if (!who || !truncated) {
      out.observer_vote = null;
      out.observer_vote_for = who;
    } else {
      delete out.observer_vote;
      delete out.observer_vote_for;
    }
    if (!stats) {
      out.stats = { flag_weight: 0, gray: false, hide: false, total_votes: activeVotes.length };
    }
  }

  return out as unknown as Entry;
}

/** `normalizeEntry` over an array (ranked / account feeds). */
export function normalizeEntries<T extends object>(raw: T[], observer: string): Entry[] {
  return raw.map((e) => normalizeEntry(e, observer));
}

/** `normalizeEntry` over a `get_discussion` map, keys kept. */
export function normalizeDiscussion<T extends object>(
  raw: Record<string, T>,
  observer: string
): Record<string, Entry> {
  const out: Record<string, Entry> = {};
  for (const [key, value] of Object.entries(raw)) {
    out[key] = normalizeEntry(value, observer);
  }
  return out;
}

/**
 * The vote `username` cast on `entry`, as far as the entry itself can tell:
 * the vote, null for "has not voted", or undefined for "unknown from this
 * entry" (it was read for another observer, or the source sent no votes).
 * Undefined means look it up (`getEntryVoteQueryOptions`); it must never be
 * read as "not voted" for good.
 *
 * Legacy rows that still carry `active_votes` are honoured, with the same
 * truncation rule as `normalizeEntry`.
 */
export function entryVoteOf(
  entry: Pick<Entry, "observer_vote" | "observer_vote_for" | "active_votes" | "stats"> | null | undefined,
  username: string | null | undefined
): ObserverVote | null | undefined {
  if (!entry || !username) return undefined;
  if (entry.observer_vote_for === username && entry.observer_vote !== undefined) {
    return entry.observer_vote;
  }
  if (Array.isArray(entry.active_votes) && entry.active_votes.length > 0) {
    const row = entry.active_votes.find((v) => v.voter === username) as
      | { rshares: unknown; percent?: unknown }
      | undefined;
    if (row) return toObserverVote({ rshares: row.rshares, percent: row.percent });
    const total = toNumber(entry.stats?.total_votes);
    const truncated =
      entry.active_votes.length >= BRIDGE_V1_ACTIVE_VOTES_CAP && total > entry.active_votes.length;
    return truncated ? undefined : null;
  }
  return undefined;
}

/**
 * Direction of a vote for UI state: "up", "down", or null for no vote. A
 * known percent decides (0 = a removed vote); without one, rshares does, with
 * 0 counted as up, as the voter list always did.
 */
export function voteDirection(vote: ObserverVote | null | undefined): "up" | "down" | null {
  if (!vote) return null;
  if (vote.percent !== null && vote.percent !== undefined) {
    return vote.percent > 0 ? "up" : vote.percent < 0 ? "down" : null;
  }
  return vote.rshares < 0 ? "down" : "up";
}

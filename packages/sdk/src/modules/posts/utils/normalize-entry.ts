import type { Entry, EntryTopVote, ObserverVote } from "../types";

/**
 * The most voters a v1 bridge read puts in `active_votes`. A list this long
 * may have been cut off, so an observer missing from it proves nothing.
 * `stats.total_votes` cannot tell: it is not a row count (live: 206 rows,
 * total 205), so the list length alone decides.
 */
export const BRIDGE_V1_ACTIVE_VOTES_CAP = 1000;

/** How many voters `normalizeEntry` derives into `top_votes` from a v1 list. */
export const DERIVED_TOP_VOTES = 10;

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Whether a vote counts as cast: a non-zero percent, or, when the percent is
 * unknown (v1 rows carry only rshares), non-zero rshares. A vote with a weight
 * but no voting power (percent set, rshares 0) is cast. Percent 0 is a removed
 * vote. This is the one rule every "did the user vote" check uses.
 */
export function isCastVote(vote: ObserverVote | null | undefined): vote is ObserverVote {
  if (!vote) return false;
  if (vote.percent !== null && vote.percent !== undefined) return vote.percent !== 0;
  return vote.rshares !== 0;
}

/** Coerce a vote-like value to an ObserverVote; null for none or a zero vote. */
function toObserverVote(value: unknown): ObserverVote | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { rshares?: unknown; percent?: unknown };
  const vote: ObserverVote = {
    rshares: toNumber(v.rshares),
    percent: v.percent === undefined || v.percent === null ? null : toNumber(v.percent)
  };
  return isCastVote(vote) ? vote : null;
}

type VoteRow = { voter?: unknown; rshares?: unknown; percent?: unknown };

function deriveTopVotes(rows: VoteRow[]): EntryTopVote[] {
  return rows
    .filter((r) => r && typeof r.voter === "string")
    .map((r) => ({
      voter: r.voter as string,
      rshares: toNumber(r.rshares),
      percent: r.percent === undefined || r.percent === null ? null : toNumber(r.percent)
    }))
    .sort(
      (a, b) =>
        Math.abs(b.rshares) - Math.abs(a.rshares) || (a.voter < b.voter ? -1 : a.voter > b.voter ? 1 : 0)
    )
    .slice(0, DERIVED_TOP_VOTES);
}

/**
 * Turn one post from any source (bridge v1 or v2, condenser, private-api
 * feeds) into the SDK `Entry` shape. Pure: no I/O, the input is not mutated,
 * so it can run in a node script to produce golden vectors for other clients.
 *
 * The decision is made from the SHAPE of `raw`, never from the method that was
 * called (a cache in front of the nodes may answer a v2 request with a v1
 * body).
 *
 * Output contract for the vote fields. Both keys are ALWAYS present, so a
 * spread merge with older data can never refill them:
 *
 * - Known: `observer_vote_for` is the (non-empty) account the entry was read
 *   for, and `observer_vote` is that account's vote `{ rshares, percent }`
 *   (percent null when the source did not say), or null for "has not voted".
 *   A zero vote (see `isCastVote`) is null.
 * - Unknown: `observer_vote_for: null` and `observer_vote: null`. Nothing may be
 *   concluded about anyone's vote; look it up (`getEntryVoteQueryOptions`).
 *
 * How the pair is decided, in order:
 * 1. `raw` already has an `observer_vote_for` key (it was normalized before):
 *    the pair is kept, only coerced. Re-normalizing for another observer never
 *    relabels a vote.
 * 2. Empty observer: unknown.
 * 3. `observer_vote` key present (v2): known, from it.
 * 4. `active_votes` array present (v1, condenser, private-api rows): the
 *    observer's row is the vote; absence is "not voted" only when the list has
 *    fewer than 1000 rows, otherwise unknown.
 * 5. Neither: unknown.
 *
 * Other fields: `active_votes` is always removed. `top_votes` from v2 is kept
 * (coerced); for a v1 list it is derived (top 10 by |rshares|, then voter,
 * percent null when the row has none); absent otherwise. A row with no `stats`
 * gets `stats` from its list length only when the list is under 1000 rows.
 * Everything else passes through.
 */
export function normalizeEntry<T extends object>(raw: T, observer: string): Entry {
  if (!raw || typeof raw !== "object") return raw as unknown as Entry;

  const { active_votes: activeVotes, ...rest } = raw as Record<string, unknown> & {
    active_votes?: unknown;
  };
  const out: Record<string, unknown> = { ...rest };
  const who = typeof observer === "string" ? observer : "";
  const list = Array.isArray(activeVotes) ? (activeVotes as VoteRow[]) : undefined;

  let vote: ObserverVote | null = null;
  let voteFor: string | null = null;
  if ("observer_vote_for" in raw) {
    const prev = (raw as { observer_vote_for?: unknown }).observer_vote_for;
    voteFor = typeof prev === "string" && prev !== "" ? prev : null;
    vote = voteFor ? toObserverVote((raw as { observer_vote?: unknown }).observer_vote) : null;
  } else if (!who) {
    // unknown
  } else if ("observer_vote" in raw) {
    voteFor = who;
    vote = toObserverVote((raw as { observer_vote?: unknown }).observer_vote);
  } else if (list) {
    const row = list.find((v) => v && v.voter === who);
    if (row) {
      voteFor = who;
      vote = toObserverVote({ rshares: row.rshares, percent: row.percent });
    } else if (list.length < BRIDGE_V1_ACTIVE_VOTES_CAP) {
      voteFor = who;
    }
  }
  out.observer_vote = vote;
  out.observer_vote_for = voteFor;

  if (Array.isArray(out.top_votes)) {
    out.top_votes = (out.top_votes as VoteRow[]).map((r) => ({
      voter: String(r?.voter ?? ""),
      rshares: toNumber(r?.rshares),
      percent: r?.percent === undefined || r?.percent === null ? null : toNumber(r.percent)
    }));
  } else if (list) {
    out.top_votes = deriveTopVotes(list);
  }

  if (list && !out.stats && list.length < BRIDGE_V1_ACTIVE_VOTES_CAP) {
    out.stats = { flag_weight: 0, gray: false, hide: false, total_votes: list.length };
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
 * entry" (it was read for another observer, or for none). Undefined means look
 * it up (`getEntryVoteQueryOptions`); it must never be read as "not voted".
 * Only normalized entries answer: a raw voter list is not read.
 */
export function entryVoteOf(
  entry: Pick<Entry, "observer_vote" | "observer_vote_for"> | null | undefined,
  username: string | null | undefined
): ObserverVote | null | undefined {
  if (!entry || !username) return undefined;
  if (typeof entry.observer_vote_for !== "string" || entry.observer_vote_for !== username) {
    return undefined;
  }
  return isCastVote(entry.observer_vote) ? entry.observer_vote : null;
}

/** Direction of a vote for UI state: "up", "down", or null when not cast. */
export function voteDirection(vote: ObserverVote | null | undefined): "up" | "down" | null {
  if (!isCastVote(vote)) return null;
  if (vote.percent !== null && vote.percent !== undefined) {
    return vote.percent > 0 ? "up" : "down";
  }
  return vote.rshares > 0 ? "up" : "down";
}

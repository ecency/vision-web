import { DAY_MS, HOUR_MS, LOCKED_VOTE_FLOOR_PCT } from "./consts";
import type { WindowState } from "./types";

const LOCKED_MS = 12 * HOUR_MS;
const URGENT_MS = 2 * HOUR_MS;

function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  // Chain timestamps come without a zone and mean UTC.
  const text = /Z|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Curation window of a post at `now`, from `created` and `payout_at` only.
 * The chain pays full curation inside 24 h, half from 24 to 72 h, one eighth
 * after that. In the last 12 h before payout it scales a vote's rshares
 * linearly toward zero (hive_evaluator_social.cpp:711-713). There is no early
 * vote penalty since HF25.
 */
export function computeWindow(
  created: string,
  payoutAt: string | null | undefined,
  now: number
): WindowState {
  const createdMs = toMs(created) ?? now;
  const payoutMs = toMs(payoutAt) ?? createdMs + 7 * DAY_MS;

  if (payoutMs <= now) {
    return { kind: "paid" };
  }
  const untilPayout = payoutMs - now;
  if (untilPayout <= LOCKED_MS) {
    const scalePct = Math.round((100 * untilPayout) / LOCKED_MS);
    return { kind: "locked", scalePct, voteHidden: scalePct < LOCKED_VOTE_FLOOR_PCT };
  }
  const age = now - createdMs;
  if (age < DAY_MS) {
    const msLeft = DAY_MS - age;
    return { kind: "full", msLeft, urgent: msLeft < URGENT_MS };
  }
  if (age < 3 * DAY_MS) {
    return { kind: "half", ageMs: age };
  }
  return { kind: "eighth", ageMs: age };
}

/** "4 h 12 m" style duration, hours and minutes only. */
export function formatHm(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} m`;
  return `${h} h ${m} m`;
}

export function parseChainDate(value: string | null | undefined): number | null {
  return toMs(value);
}

/**
 * "14:05" in UTC. Chain and desk timestamps arrive without a zone, so they go
 * through parseChainDate first: `new Date(value)` would read them as local
 * time and print an hour that is off by the viewer's offset.
 */
export function formatUtcHm(value: string | null | undefined): string {
  const ms = toMs(value);
  if (ms == null) return "";
  return new Date(ms).toISOString().slice(11, 16);
}

/** "2026-09-05 14:05" in UTC, for a date that is not necessarily today. */
export function formatUtcDateHm(value: string | null | undefined): string {
  const ms = toMs(value);
  if (ms == null) return "";
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

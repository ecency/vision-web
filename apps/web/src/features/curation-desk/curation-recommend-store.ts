"use client";

import { useSyncExternalStore } from "react";
import type { RecommendState } from "./types";

/**
 * The viewer's recommendation state per post for this browser session.
 *
 * The chain, not route 5, is the truth for the recommender's own state: a
 * broadcast flips the row optimistically and the state must survive the row
 * scrolling out of a virtualized list and back, which is why it lives outside
 * component state. Never reverts to "Recommend" on its own: a second broadcast
 * would spend RC and add a chain row for nothing.
 *
 * Every entry is keyed by the viewer as well as the post. One browser can hold
 * several accounts; "you recommended this" is a fact about an account, so
 * switching accounts must not show the new one somebody else's optimistic row.
 */
const states = new Map<string, RecommendState>();
const listeners = new Set<() => void>();
const IDLE: RecommendState = { phase: "idle" };

export function recommendKey(
  username: string | undefined,
  author: string,
  permlink: string
): string {
  return `${username ?? "anon"}:${author}/${permlink}`;
}

function emit() {
  listeners.forEach((l) => l());
}

export function getRecommendState(
  username: string | undefined,
  author: string,
  permlink: string
): RecommendState {
  return states.get(recommendKey(username, author, permlink)) ?? IDLE;
}

export function setRecommendState(
  username: string | undefined,
  author: string,
  permlink: string,
  state: RecommendState
) {
  states.set(recommendKey(username, author, permlink), state);
  emit();
}

/** Drops every optimistic state, for an account switch or a spec. */
export function clearRecommendStates() {
  if (states.size === 0) return;
  states.clear();
  emit();
}

export function useRecommendState(
  username: string | undefined,
  author: string,
  permlink: string
): RecommendState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => getRecommendState(username, author, permlink),
    () => IDLE
  );
}

/**
 * Test-only. The body is compiled out of a production bundle (`NODE_ENV` is a
 * literal there), so the export costs a name and nothing else.
 */
export function resetRecommendStoreForTests() {
  if (process.env.NODE_ENV === "production") return;
  states.clear();
  emit();
}

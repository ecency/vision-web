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
 */
const states = new Map<string, RecommendState>();
const listeners = new Set<() => void>();
const IDLE: RecommendState = { phase: "idle" };

export function recommendKey(author: string, permlink: string): string {
  return `${author}/${permlink}`;
}

function emit() {
  listeners.forEach((l) => l());
}

export function getRecommendState(author: string, permlink: string): RecommendState {
  return states.get(recommendKey(author, permlink)) ?? IDLE;
}

export function setRecommendState(author: string, permlink: string, state: RecommendState) {
  states.set(recommendKey(author, permlink), state);
  emit();
}

export function useRecommendState(author: string, permlink: string): RecommendState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => getRecommendState(author, permlink),
    () => IDLE
  );
}

/** Test-only. */
export function resetRecommendStoreForTests() {
  states.clear();
  emit();
}

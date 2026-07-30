"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import isEqual from "react-fast-compare";
import { useDebounce } from "react-use";
import { useSaveDraftApi } from "../_api";
import { useDraftTabCoordinator } from "./use-draft-tab-coordinator";
import {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_MIN_INTERVAL_MS,
  AUTOSAVE_FAIL_THRESHOLD,
  AUTOSAVE_COOLDOWN_MS
} from "./autosave-policy";

interface Options {
  /**
   * Draft being written to. Undefined on the new-post route until the first
   * save creates one, after which the created id is used for every later save.
   */
  draftId?: string;
  /** Whether autosave may run at all: signed in, on the edit step, has content. */
  enabled: boolean;
  /**
   * Everything that has to be persisted. Must be referentially stable while
   * unchanged (build it with useMemo) - it drives the debounce.
   */
  snapshot: Record<string, unknown>;
}

/**
 * Shared autosave engine for the publish composer and the draft editor, which
 * previously carried two near-identical copies of this logic and therefore two
 * copies of every bug in it.
 */
export function useDraftAutosave({ draftId, enabled, snapshot }: Options) {
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [createdDraftId, setCreatedDraftId] = useState<string>();

  const effectiveDraftId = draftId ?? createdDraftId;

  const { mutateAsync: saveToDraft } = useSaveDraftApi(effectiveDraftId);
  const { isActiveTab } = useDraftTabCoordinator(effectiveDraftId);

  const prevSnapshotRef = useRef<unknown>(null);
  const lastAttemptAtRef = useRef<number>(0);
  const consecutiveFailsRef = useRef<number>(0);
  const cooldownUntilRef = useRef<number>(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef<() => void>(() => {});
  const isSavingRef = useRef(false);

  const scheduleRetry = useCallback((delay: number) => {
    // One pending retry is enough: it re-reads the newest snapshot when it runs.
    if (retryTimerRef.current) {
      return;
    }

    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      attemptRef.current();
    }, delay);
  }, []);

  const attempt = useCallback(async () => {
    if (!enabled) return;
    // Only the tab holding the lock may write, or two tabs would race.
    if (!isActiveTab) return;

    const now = Date.now();
    // Circuit breaker: too many consecutive failures backs us off so a broken
    // server (e.g. /private-api/drafts-add returning 406) can't be hammered
    // every debounce window.
    if (now < cooldownUntilRef.current) return;

    if (isEqual(prevSnapshotRef.current, snapshot)) return;

    const sinceLastAttempt = now - lastAttemptAtRef.current;

    // Never let two saves be on the wire at once. Responses are not guaranteed
    // to come back in the order they were sent, so a slow earlier request can
    // land after a newer one and overwrite the newer content on the server -
    // and then set prevSnapshotRef to the older snapshot, so the newer content
    // no longer even looks unsaved. Serialising also means the assignment to
    // prevSnapshotRef below always belongs to the most recent completed save.
    if (isSavingRef.current) {
      scheduleRetry(Math.max(AUTOSAVE_MIN_INTERVAL_MS - sinceLastAttempt, 1_000));
      return;
    }

    if (sinceLastAttempt < AUTOSAVE_MIN_INTERVAL_MS) {
      // Defer, never drop. This used to `return` outright, which discarded the
      // save entirely: the next attempt could only come from a *further* edit
      // followed by another full debounce window, so someone who stopped
      // typing right after a throttled change never got that work persisted at
      // all. Re-arm for the remainder of the window instead.
      scheduleRetry(AUTOSAVE_MIN_INTERVAL_MS - sinceLastAttempt);
      return;
    }

    lastAttemptAtRef.current = now;
    isSavingRef.current = true;

    try {
      const id = await saveToDraft({ showToast: false, redirect: false });
      // Only a create returns an id; updates resolve undefined.
      if (id) {
        setCreatedDraftId(id);
      }
      setLastSaved(new Date());
      prevSnapshotRef.current = snapshot;
      consecutiveFailsRef.current = 0;
    } catch {
      consecutiveFailsRef.current += 1;
      if (consecutiveFailsRef.current >= AUTOSAVE_FAIL_THRESHOLD) {
        cooldownUntilRef.current = Date.now() + AUTOSAVE_COOLDOWN_MS;
      }
    } finally {
      isSavingRef.current = false;
    }
  }, [enabled, isActiveTab, saveToDraft, scheduleRetry, snapshot]);

  // Keep the retry timer pointed at the newest closure, so a deferred save
  // writes the latest content rather than whatever was current when it was
  // scheduled.
  attemptRef.current = attempt;

  useDebounce(() => attemptRef.current(), AUTOSAVE_DEBOUNCE_MS, [snapshot, enabled, isActiveTab]);

  useEffect(
    () => () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    },
    []
  );

  return { lastSaved, isActiveTab, draftId: effectiveDraftId };
}

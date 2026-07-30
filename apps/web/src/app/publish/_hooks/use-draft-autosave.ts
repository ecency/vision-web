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
  const inFlightRef = useRef<Promise<string | undefined> | null>(null);

  /**
   * The only path that writes this draft. Every caller queues behind whatever
   * is already on the wire, because responses are not guaranteed to come back
   * in the order they were sent: a slow earlier request landing after a newer
   * one would overwrite the newer content on the server and in the drafts
   * cache.
   *
   * This has to be shared rather than per-caller. Autosave used to be the only
   * writer and guarded itself with a boolean, which stopped guarding anything
   * the moment a second entry point (the Open draft flush) opened its own
   * mutation alongside it.
   */
  const save = useCallback(async () => {
    const previous = inFlightRef.current;

    const run = (async () => {
      if (previous) {
        // Only the ordering matters here, not whether it succeeded.
        await previous.catch(() => undefined);
      }
      return saveToDraft({ showToast: false, redirect: false });
    })();

    inFlightRef.current = run;

    try {
      return await run;
    } finally {
      if (inFlightRef.current === run) {
        inFlightRef.current = null;
      }
    }
  }, [saveToDraft]);

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

    // A write is already on the wire. Autosave defers rather than queueing:
    // whatever is in flight is at most a minute old, and the retry re-reads the
    // newest content anyway. A user-initiated flush queues instead - see below.
    if (inFlightRef.current) {
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

    try {
      const id = await save();
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
    }
  }, [enabled, isActiveTab, save, scheduleRetry, snapshot]);

  /**
   * Write the current content now, queued behind any autosave already on the
   * wire, and let the caller await the result. This is what the Open draft
   * action uses before it navigates: the draft route refills publish state from
   * the server copy, so it must be looking at a copy that includes everything
   * typed since the last autosave.
   *
   * Errors propagate - a caller that is about to navigate needs to know the
   * flush did not land.
   */
  const flush = useCallback(async () => {
    const id = await save();

    if (id) {
      setCreatedDraftId(id);
    }
    setLastSaved(new Date());
    prevSnapshotRef.current = snapshot;
    consecutiveFailsRef.current = 0;

    return id;
  }, [save, snapshot]);

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

  return { lastSaved, isActiveTab, draftId: effectiveDraftId, flush };
}

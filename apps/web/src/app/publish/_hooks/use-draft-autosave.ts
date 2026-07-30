"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import isEqual from "react-fast-compare";
import { useDebounce } from "react-use";
import { useSaveDraftApi } from "../_api";
import type { SaveDraftOptions } from "../_api/use-save-draft";
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
  // Mirrors createdDraftId, but updated synchronously the moment a create
  // returns so a queued write behind it targets the new draft rather than
  // creating another. The state copy exists only to drive re-renders.
  const createdDraftIdRef = useRef<string | undefined>(undefined);

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
  const save = useCallback(
    async (options?: SaveDraftOptions) => {
      // inFlightRef only serialises this tab. Ordering *between* tabs is the
      // draft lock's job, so every write has to respect it - a write that skips
      // the lock can overwrite whatever the tab holding it just stored.
      if (!isActiveTab) {
        throw new Error("[Draft] Another tab is editing this draft");
      }

      const previous = inFlightRef.current;

      const run = (async () => {
        if (previous) {
          // Only the ordering matters here, not whether it succeeded.
          await previous.catch(() => undefined);
        }

        // Resolved *after* the queue drains, never at call time. If the write
        // we just waited on was the create, it produced the id a moment ago and
        // React has not re-rendered yet - reading the hook-level id here would
        // still see undefined and create a second draft.
        const targetDraftId = draftId ?? createdDraftIdRef.current;

        const id = await saveToDraft({
          showToast: false,
          redirect: false,
          draftId: targetDraftId,
          ...options
        });

        // Synchronously, so the next queued write sees it without a render.
        if (id) {
          createdDraftIdRef.current = id;
        }

        return id;
      })();

      inFlightRef.current = run;

      try {
        return await run;
      } finally {
        if (inFlightRef.current === run) {
          inFlightRef.current = null;
        }
      }
    },
    [draftId, isActiveTab, saveToDraft]
  );

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
   * wire, and let the caller await the result. Both user-initiated writes go
   * through this: the Save draft button and the Open draft action.
   *
   * Open draft needs it because `/publish/drafts/[id]` refills publish state
   * from the server copy, so that copy has to include everything typed since
   * the last autosave. Save draft needs it because a manual save racing an
   * autosave could otherwise be overwritten by the older response - and, before
   * the first autosave has returned an id, both would take the create path and
   * produce two drafts.
   *
   * Errors propagate. A caller that is about to navigate needs to know the
   * flush did not land, and so does a button showing a success toast.
   */
  const flush = useCallback(
    async (options?: SaveDraftOptions) => {
      const id = await save(options);

      if (id) {
        setCreatedDraftId(id);
      }
      setLastSaved(new Date());
      prevSnapshotRef.current = snapshot;
      consecutiveFailsRef.current = 0;

      // `created` matters to the caller because useSaveDraftApi only redirects
      // from its create branch. A manual save that queued behind an autosave
      // which already created the draft takes the *update* path, so its
      // redirect option is ignored and the caller has to navigate itself.
      return {
        draftId: id ?? draftId ?? createdDraftIdRef.current,
        created: !!id
      };
    },
    [draftId, save, snapshot]
  );

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

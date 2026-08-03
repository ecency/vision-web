'use client';

import {
  getCommunityContextQueryOptions,
  useSubscribeCommunity,
  useUnsubscribeCommunity,
} from '@ecency/sdk';
import { useQuery } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@/core';
import { useAuth, useIsAuthEnabled, useIsAuthenticated } from '@/features/auth';
import { createBroadcastAdapter } from '@/providers/sdk';
import {
  MEMBERSHIP_CONFIRMATION,
  nextConfirmationStep,
} from '../utils/membership-confirmation';

interface Props {
  communityId: string;
}

const BUTTON =
  'px-3 py-1 rounded-md border border-theme text-xs text-theme-primary hover:bg-theme-tertiary disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * idle       nothing in flight; the label reflects the community's own answer
 * sending    the broadcast is out, no node has accepted it yet
 * confirming accepted, and we are reading the community back until it agrees
 * unconfirmed the read budget ran out; the change may or may not have landed
 * failed     the broadcast itself threw
 */
type Phase = 'idle' | 'sending' | 'confirming' | 'unconfirmed' | 'failed';

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Join or leave the community whose subscriber count sits next to this.
 *
 * The sidebar has printed a membership number with no way to become one of
 * them. Gated only on whether the instance has auth at all, exactly as
 * ReblogButton is: nobody would choose to advertise a membership and forbid it.
 *
 * Nothing here treats a successful broadcast as a completed membership change.
 * Subscriptions go out in async mode, which resolves on mempool acceptance, so
 * the community has usually not indexed anything by the time the promise
 * settles. The button therefore reads the community back on a bounded schedule
 * and stays disabled throughout, so it cannot be pressed a second time into a
 * duplicate broadcast, and when the budget runs out it says the change is
 * unconfirmed rather than claiming it worked. There is no optimistic cache
 * write anywhere in this file, on purpose: the state we would be writing is
 * exactly the state we do not know.
 */
export function CommunityJoinButton({ communityId }: Props) {
  const { user } = useAuth();
  const isAuthEnabled = useIsAuthEnabled();
  const isAuthenticated = useIsAuthenticated();
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  });

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  /** What the in-flight change is trying to make `subscribed` become. */
  const [desired, setDesired] = useState<boolean | null>(null);

  // Guards the broadcast against a second click landing in the same tick, ahead
  // of the state update that disables the button.
  const inFlight = useRef(false);
  const cancelled = useRef(false);
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  const { data: context, refetch } = useQuery(
    getCommunityContextQueryOptions(user?.username, communityId),
  );

  const adapter = createBroadcastAdapter();
  const subscribe = useSubscribeCommunity(user?.username, { adapter });
  const unsubscribe = useUnsubscribeCommunity(user?.username, { adapter });

  const subscribed = context?.subscribed === true;
  const busy = phase === 'sending' || phase === 'confirming';

  /** Read the community back until it agrees, or until the budget runs out. */
  const confirm = useCallback(
    async (target: boolean) => {
      setPhase('confirming');
      let delayMs = MEMBERSHIP_CONFIRMATION.intervalMs;

      for (let attemptsMade = 1; ; attemptsMade++) {
        await sleep(delayMs);
        if (cancelled.current) return;

        const { data } = await refetch();
        if (cancelled.current) return;

        const step = nextConfirmationStep(
          data?.subscribed,
          target,
          attemptsMade,
        );
        if (step.kind === 'confirmed') {
          setPhase('idle');
          setDesired(null);
          return;
        }
        if (step.kind === 'unconfirmed') {
          setPhase('unconfirmed');
          return;
        }
        delayMs = step.delayMs;
      }
    },
    [refetch],
  );

  const handleClick = useCallback(async () => {
    if (!user || inFlight.current) return;
    inFlight.current = true;

    const target = !subscribed;
    setDesired(target);
    setError(null);
    setPhase('sending');

    // Held for the confirmation too, not just the broadcast: the operation is
    // not over until the community has answered.
    try {
      try {
        if (subscribed) {
          await unsubscribe.mutateAsync({ community: communityId });
        } else {
          await subscribe.mutateAsync({ community: communityId });
        }
      } catch (err) {
        console.error('Community membership change failed:', err);
        if (cancelled.current) return;
        setPhase('failed');
        setError(t('community_membership_failed'));
        // The throw may have been a timeout on a broadcast that still landed,
        // so the community stays the authority on what actually happened.
        await refetch();
        return;
      }

      if (cancelled.current) return;
      await confirm(target);
    } finally {
      inFlight.current = false;
    }
  }, [user, subscribed, communityId, subscribe, unsubscribe, refetch, confirm]);

  /** Re-read the community. Never re-broadcasts, so it cannot duplicate. */
  const handleCheckAgain = useCallback(async () => {
    if (desired === null || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    try {
      await confirm(desired);
    } finally {
      inFlight.current = false;
    }
  }, [confirm, desired]);

  if (!isAuthEnabled || !communityId) return null;

  if (!isAuthenticated) {
    return (
      <Link
        to="/login"
        search={{ redirect: currentPath }}
        className={clsx(BUTTON, 'inline-block')}
      >
        {t('join_community')}
      </Link>
    );
  }

  let label: string;
  if (phase === 'sending') {
    label = desired ? t('joining') : t('leaving');
  } else if (phase === 'confirming') {
    label = t('confirming');
  } else {
    label = subscribed ? t('leave_community') : t('join_community');
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        // Disabled through the unconfirmed state as well. Re-enabling it there
        // would offer the reader the one action that produces a duplicate,
        // precisely when we cannot tell them whether the first one landed.
        disabled={busy || phase === 'unconfirmed'}
        aria-busy={busy}
        className={BUTTON}
      >
        {label}
      </button>

      {phase === 'unconfirmed' && (
        <div className="flex flex-col items-start gap-1">
          <span className="text-xs text-theme-muted">
            {t('membership_unconfirmed')}
          </span>
          <button
            type="button"
            onClick={handleCheckAgain}
            className="text-xs underline text-theme-muted"
          >
            {t('check_again')}
          </button>
        </div>
      )}

      {error && (
        <span className="text-xs text-red-500 dark:text-red-400">{error}</span>
      )}
    </div>
  );
}

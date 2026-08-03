'use client';

import {
  getCommunityContextQueryOptions,
  useSubscribeCommunity,
  useUnsubscribeCommunity,
} from '@ecency/sdk';
import { useQuery } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import clsx from 'clsx';
import { useCallback, useState } from 'react';
import { t } from '@/core';
import { useAuth, useIsAuthEnabled, useIsAuthenticated } from '@/features/auth';
import { createBroadcastAdapter } from '@/providers/sdk';

interface Props {
  communityId: string;
}

const BUTTON =
  'px-3 py-1 rounded-md border border-theme text-xs text-theme-primary hover:bg-theme-tertiary disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * Join or leave the community whose subscriber count sits next to this.
 *
 * The sidebar has printed a membership number with no way to become one of
 * them. Gated only on whether the instance has auth at all, exactly as
 * ReblogButton is: nobody would choose to advertise a membership and forbid it.
 *
 * There is no auto-retry and no optimistic success. A `custom_json` broadcast
 * being accepted by a node does not mean the community honoured it, so the
 * button reads the community context back rather than assuming, and a failure
 * says so instead of leaving a button that looks like it worked.
 */
export function CommunityJoinButton({ communityId }: Props) {
  const { user } = useAuth();
  const isAuthEnabled = useIsAuthEnabled();
  const isAuthenticated = useIsAuthenticated();
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [error, setError] = useState<string | null>(null);

  const { data: context, refetch } = useQuery(
    getCommunityContextQueryOptions(user?.username, communityId),
  );

  const adapter = createBroadcastAdapter();
  const subscribe = useSubscribeCommunity(user?.username, { adapter });
  const unsubscribe = useUnsubscribeCommunity(user?.username, { adapter });

  const subscribed = context?.subscribed === true;
  const isPending = subscribe.isPending || unsubscribe.isPending;

  const handleClick = useCallback(async () => {
    if (!user || isPending) return;
    setError(null);
    try {
      if (subscribed) {
        await unsubscribe.mutateAsync({ community: communityId });
      } else {
        await subscribe.mutateAsync({ community: communityId });
      }
    } catch (err) {
      console.error('Community membership change failed:', err);
      setError(t('community_membership_failed'));
    } finally {
      // Whether it succeeded or not, the community is the authority on who is
      // subscribed. Read it back rather than trusting the broadcast.
      await refetch();
    }
  }, [
    user,
    isPending,
    subscribed,
    communityId,
    subscribe,
    unsubscribe,
    refetch,
  ]);

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

  const label = isPending
    ? subscribed
      ? t('leaving')
      : t('joining')
    : subscribed
      ? t('leave_community')
      : t('join_community');

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={BUTTON}
      >
        {label}
      </button>
      {error && (
        <span className="text-xs text-red-500 dark:text-red-400">{error}</span>
      )}
    </div>
  );
}

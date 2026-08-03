'use client';

import type { Entry } from '@ecency/sdk';
import { UilUsdCircle } from '@tooni/iconscout-unicons-react';
import { formatRelativeTime, t } from '@/core';
import {
  formatPayoutAmount,
  isPayoutWindowOpen,
  resolvePostPayout,
} from '../utils/payout';

interface Props {
  entry: Entry;
  /** Owner's own word for earnings, or null for the built-in label. */
  label: string | null;
}

/**
 * What the post earned, in the muted meta row beside likes and comments.
 *
 * Never a badge next to the headline: one earnings figure per surface, at the
 * same size and colour as the other facts about the post. Renders nothing at
 * all when the figure would be zero or the entry carries no readable payout
 * fields, which is what keeps the search feed safe.
 */
export function PostPayout({ entry, label }: Props) {
  const payout = resolvePostPayout(entry);
  if (!payout) return null;

  const figure = payout.declined
    ? t('rewards_declined')
    : formatPayoutAmount(payout.amount);

  // A custom label is one string used in both states, so its copy has to be
  // state-independent. The built-in one is not, and says which state it is in.
  const heading =
    label ?? (payout.paidOut ? t('rewards_earned') : t('rewards_pending'));

  return (
    <div className="flex items-center gap-1" title={t('payout_hint')}>
      <UilUsdCircle className="size-4" aria-hidden="true" />
      <span>{payout.declined ? figure : `${heading} ${figure}`}</span>
      {isPayoutWindowOpen(entry) && (
        <span className="opacity-80">
          {`· ${t('payout_window')} ${formatRelativeTime(entry.payout_at)}`}
        </span>
      )}
    </div>
  );
}

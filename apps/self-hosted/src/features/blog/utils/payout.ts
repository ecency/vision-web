import { parseAsset } from '@ecency/sdk';

/**
 * What a post has earned, read off the entry the feed already loaded.
 *
 * Kept pure and structurally typed rather than taking `Entry`, because the
 * entries this runs against are not all real ones: `search-results.tsx` builds
 * an object by hand with no payout fields at all and casts it
 * `as unknown as Entry`. Every field below is therefore `unknown` and every
 * read of it is defensive.
 */
export interface PayoutSource {
  pending_payout_value?: unknown;
  author_payout_value?: unknown;
  curator_payout_value?: unknown;
  max_accepted_payout?: unknown;
  is_paidout?: unknown;
  payout_at?: unknown;
}

export interface PostPayout {
  /** Dollar figure to print, already capped at max_accepted_payout. */
  amount: number;
  /** The author set max_accepted_payout to zero: no rewards, not zero rewards. */
  declined: boolean;
  /** The seven-day window has closed and the figure is final. */
  paidOut: boolean;
}

/**
 * One asset string as a number, or null.
 *
 * `parseAsset` THROWS on an absent or non-string value: its else branch reads
 * `sval.amount.toString()`, so `parseAsset(undefined)` is a TypeError, not NaN.
 * A search-shaped entry has none of these fields, so an unguarded call here
 * puts the whole page in the root error boundary. Catching is the point of this
 * wrapper; the NaN check catches the other half, a string that is not an asset.
 */
function amountOf(value: unknown): number | null {
  try {
    const { amount } = parseAsset(value as string);
    return Number.isFinite(amount) ? amount : null;
  } catch {
    return null;
  }
}

/**
 * The payout to show, or null when there is nothing honest to show.
 *
 * Null covers three cases the caller must render as nothing rather than as a
 * figure: no parseable payout fields at all (a search result), a total that
 * rounds to $0.00, and any asset string the chain did not produce.
 *
 * Suppressing $0.00 is deliberate. It makes a three-week-old zero-earning post
 * indistinguishable from a ten-minute-old one, which removes the case a
 * personal blogger would actually mind and is part of what makes showing
 * earnings by default defensible.
 */
export function resolvePostPayout(entry: PayoutSource): PostPayout | null {
  const paidOut = entry.is_paidout === true;

  // Naively reading pending_payout_value alone prints $0.00 on every archived
  // post: after payout the pending value is zero and the money has moved into
  // the author and curator fields.
  const parts = paidOut
    ? [
        amountOf(entry.author_payout_value),
        amountOf(entry.curator_payout_value),
      ]
    : [
        amountOf(entry.pending_payout_value),
        amountOf(entry.author_payout_value),
        amountOf(entry.curator_payout_value),
      ];

  if (parts.every((part) => part === null)) return null;

  const total = parts.reduce<number>((sum, part) => sum + (part ?? 0), 0);
  const max = amountOf(entry.max_accepted_payout);

  // A zero cap is the author declining rewards, which is a statement, not an
  // amount. Printing $0.00 for it says something different and wrong.
  if (max === 0) {
    return { amount: 0, declined: true, paidOut };
  }

  const capped = max !== null && max > 0 && total >= max ? max : total;
  const amount = Math.round(capped * 100) / 100;

  if (amount === 0) return null;

  return { amount, declined: false, paidOut };
}

/** `$4.20`. The dollar follows every Hive frontend and the HBD soft peg. */
export function formatPayoutAmount(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * True when the payout window is still open and its closing time is knowable.
 *
 * Guarded on both `is_paidout` and the timestamp actually being in the future.
 * `formatRelativeTime` adds a suffix unconditionally, so a `payout_at` in the
 * past renders "pays out 2 years ago" on an archived post, which is most posts
 * on a blog imported from an existing Hive account.
 */
export function isPayoutWindowOpen(
  entry: PayoutSource,
  now: Date = new Date(),
): boolean {
  if (entry.is_paidout === true) return false;
  if (typeof entry.payout_at !== 'string') return false;
  // Hive timestamps carry no zone designator and are UTC.
  const at = new Date(
    entry.payout_at.endsWith('Z') ? entry.payout_at : `${entry.payout_at}Z`,
  );
  const time = at.getTime();
  return Number.isFinite(time) && time > now.getTime();
}

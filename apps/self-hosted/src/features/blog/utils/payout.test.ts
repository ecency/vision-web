import { describe, expect, it } from 'vitest';
import {
  formatPayoutAmount,
  isPayoutWindowOpen,
  type PayoutSource,
  resolvePostPayout,
} from './payout';

/** A pending post as the bridge API actually returns one. */
function pending(overrides: PayoutSource = {}): PayoutSource {
  return {
    pending_payout_value: '4.200 HBD',
    author_payout_value: '0.000 HBD',
    curator_payout_value: '0.000 HBD',
    max_accepted_payout: '1000000.000 HBD',
    is_paidout: false,
    payout_at: '2026-08-10T00:00:00',
    ...overrides,
  };
}

/**
 * The shape `search-results.tsx` builds by hand and casts `as unknown as Entry`.
 * It carries no payout fields at all, which is the input that crashes an
 * unguarded `parseAsset`.
 */
const SEARCH_SHAPED: PayoutSource = {};

describe('resolvePostPayout', () => {
  it('reads a pending payout', () => {
    expect(resolvePostPayout(pending())).toEqual({
      amount: 4.2,
      declined: false,
      paidOut: false,
    });
  });

  it('sums author and curator payouts on a paid-out post', () => {
    // The whole point: reading pending_payout_value alone prints $0.00 here,
    // and on a real blog most posts are in this state.
    const paid = pending({
      is_paidout: true,
      pending_payout_value: '0.000 HBD',
      author_payout_value: '3.000 HBD',
      curator_payout_value: '1.500 HBD',
    });
    expect(resolvePostPayout(paid)).toEqual({
      amount: 4.5,
      declined: false,
      paidOut: true,
    });
  });

  it('reports declined rewards rather than a zero amount', () => {
    const declined = resolvePostPayout(
      pending({ max_accepted_payout: '0.000 HBD' }),
    );
    expect(declined).toEqual({ amount: 0, declined: true, paidOut: false });
  });

  it('caps the figure at max_accepted_payout', () => {
    const capped = pending({
      pending_payout_value: '90.000 HBD',
      max_accepted_payout: '10.000 HBD',
    });
    expect(resolvePostPayout(capped)?.amount).toBe(10);
  });

  it('returns null for an entry with no payout fields', () => {
    expect(resolvePostPayout(SEARCH_SHAPED)).toBeNull();
  });

  it('does not throw on absent or non-string payout fields', () => {
    // parseAsset's non-string branch reads `sval.amount.toString()`, so an
    // absent field is a TypeError rather than NaN. Unguarded, that takes the
    // whole page down through the root error boundary.
    const hostile: PayoutSource[] = [
      {},
      { pending_payout_value: undefined },
      { pending_payout_value: null },
      { pending_payout_value: 42 },
      { pending_payout_value: [] },
      { pending_payout_value: 'not an asset' },
      { pending_payout_value: '4.200 HBD', max_accepted_payout: null },
      { pending_payout_value: '4.200 HBD', max_accepted_payout: 'rubbish' },
    ];
    for (const entry of hostile) {
      expect(() => resolvePostPayout(entry)).not.toThrow();
    }
    expect(resolvePostPayout({ pending_payout_value: 42 })).toBeNull();
    expect(
      resolvePostPayout({ pending_payout_value: 'not an asset' }),
    ).toBeNull();
  });

  it('says nothing when the cap is the only readable field', () => {
    // Declined is a statement about a payout record. With no payout fields at
    // all there is no record to make it about, so a lone zero cap must not
    // print "Rewards declined" over an entry the payout math never saw.
    expect(resolvePostPayout({ max_accepted_payout: '0.000 HBD' })).toBeNull();
    expect(resolvePostPayout({ max_accepted_payout: '10.000 HBD' })).toBeNull();
  });

  it('still shows a payout when only the cap is unreadable', () => {
    const entry = pending({ max_accepted_payout: 'rubbish' });
    expect(resolvePostPayout(entry)?.amount).toBe(4.2);
  });

  it('suppresses a figure that would render as $0.00', () => {
    expect(
      resolvePostPayout(pending({ pending_payout_value: '0.000 HBD' })),
    ).toBeNull();
    expect(
      resolvePostPayout(pending({ pending_payout_value: '0.004 HBD' })),
    ).toBeNull();
    expect(
      resolvePostPayout(pending({ pending_payout_value: '0.005 HBD' }))?.amount,
    ).toBe(0.01);
  });
});

describe('formatPayoutAmount', () => {
  it('always prints two decimals', () => {
    expect(formatPayoutAmount(4.2)).toBe('$4.20');
    expect(formatPayoutAmount(10)).toBe('$10.00');
    expect(formatPayoutAmount(0.01)).toBe('$0.01');
  });
});

describe('isPayoutWindowOpen', () => {
  const now = new Date('2026-08-03T00:00:00Z');

  it('is open while payout_at is in the future', () => {
    expect(isPayoutWindowOpen(pending(), now)).toBe(true);
  });

  it('is closed once the post has paid out', () => {
    // The regression this guards: formatRelativeTime adds a suffix
    // unconditionally, so an archived post reads "pays out 2 years ago".
    expect(isPayoutWindowOpen(pending({ is_paidout: true }), now)).toBe(false);
  });

  it('is closed when payout_at is already in the past', () => {
    expect(
      isPayoutWindowOpen(pending({ payout_at: '2024-01-01T00:00:00' }), now),
    ).toBe(false);
  });

  it('is closed when payout_at is missing or unparseable', () => {
    expect(isPayoutWindowOpen({}, now)).toBe(false);
    expect(isPayoutWindowOpen(pending({ payout_at: 'soon' }), now)).toBe(false);
    expect(isPayoutWindowOpen(pending({ payout_at: 12345 }), now)).toBe(false);
  });

  it('closes exactly at payout_at', () => {
    // A zoneless Hive timestamp is UTC; the Z is appended before parsing so the
    // window does not flip open or shut with the reader's own timezone. Under a
    // UTC test runner this asserts the boundary comparison rather than the zone.
    expect(
      isPayoutWindowOpen(pending(), new Date('2026-08-09T23:59:59Z')),
    ).toBe(true);
    expect(
      isPayoutWindowOpen(pending(), new Date('2026-08-10T00:00:00Z')),
    ).toBe(false);
  });
});

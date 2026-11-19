import { describe, expect, it } from 'vitest';
import {
  remainingMonths,
  customDomainUpgradeHbd,
  CUSTOM_DOMAIN_UPGRADE_DELTA_HBD,
  MONTHLY_PRICE_HBD,
  CUSTOM_DOMAIN_MONTHLY_PRICE_HBD,
  creditCustomDomainPayment,
  hbdAsTimeMs,
} from './pricing';

const now = new Date('2026-01-15T00:00:00.000Z');

describe('remainingMonths', () => {
  it('is 0 for a null or already-expired term', () => {
    expect(remainingMonths(null, now)).toBe(0);
    expect(remainingMonths(new Date('2026-01-14T00:00:00.000Z'), now)).toBe(0);
  });

  it('counts whole calendar months to expiry', () => {
    // Same day-of-month, 5 months out.
    expect(remainingMonths(new Date('2026-06-15T00:00:00.000Z'), now)).toBe(5);
    // Exactly a year (same day) -> 12, not 13.
    expect(remainingMonths(new Date('2027-01-15T00:00:00.000Z'), now)).toBe(12);
  });

  it('rounds a partial month UP', () => {
    // 5 months + a few days -> 6.
    expect(remainingMonths(new Date('2026-06-20T00:00:00.000Z'), now)).toBe(6);
  });

  it('is at least 1 for any future expiry (min one month of the add-on)', () => {
    expect(remainingMonths(new Date('2026-01-16T00:00:00.000Z'), now)).toBe(1);
  });

  it('handles JS end-of-month rollover as a single month (Jan 31 + 1mo -> Mar 3 = 1)', () => {
    const jan31 = new Date('2026-01-31T00:00:00.000Z');
    // A one-month term bought on Jan 31 lands on Mar 3 (Feb has no 31st). Upgrading immediately
    // must count that as ONE remaining month, not two.
    expect(remainingMonths(new Date('2026-03-03T00:00:00.000Z'), jan31)).toBe(1);
  });

  it('never rises as time passes, so a quoted premium stays payable (month-end crossing)', () => {
    const expiry = new Date('2027-03-03T12:00:00Z');
    expect(remainingMonths(expiry, new Date('2027-02-01T00:00:01Z'))).toBeLessThanOrEqual(
      remainingMonths(expiry, new Date('2027-01-31T23:59:59Z'))
    );
    // Every hour up to each expiry: the count only goes down.
    for (const exp of ['2027-03-03T12:00:00Z', '2026-12-31T00:00:00Z', '2027-05-01T08:00:00Z']) {
      const e = new Date(exp);
      let prev = Infinity;
      for (let t = Date.UTC(2025, 10, 1); t < e.getTime(); t += 3600 * 1000) {
        const m = remainingMonths(e, new Date(t));
        if (m > prev) expect.fail(`rose to ${m} at ${new Date(t).toISOString()} for expiry ${exp}`);
        prev = m;
      }
    }
  });

  it('counts a freshly bought N-month term as N months, from any start day', () => {
    for (let d = 0; d < 800; d++) {
      const start = new Date(Date.UTC(2026, 0, 1) + d * 86400000 + 13 * 3600000);
      for (let n = 1; n <= 24; n++) {
        const expiry = new Date(start.getTime());
        expiry.setMonth(expiry.getMonth() + n);
        const m = remainingMonths(expiry, start);
        if (m !== n) expect.fail(`${start.toISOString()} +${n} months counted as ${m}`);
      }
    }
  });
});

describe('customDomainUpgradeHbd', () => {
  it('is remaining months x the +1/mo custom-domain premium', () => {
    // Default delta is the custom-domain monthly minus standard monthly (= 1 HBD).
    expect(CUSTOM_DOMAIN_UPGRADE_DELTA_HBD).toBe(CUSTOM_DOMAIN_MONTHLY_PRICE_HBD - MONTHLY_PRICE_HBD);
    expect(customDomainUpgradeHbd(new Date('2026-06-15T00:00:00.000Z'), now)).toBe(
      5 * CUSTOM_DOMAIN_UPGRADE_DELTA_HBD
    );
  });

  it('is 0 for an expired/null term (no upgrade to charge)', () => {
    expect(customDomainUpgradeHbd(null, now)).toBe(0);
  });
});

describe('creditCustomDomainPayment', () => {
  const standard = (expiresAt: string) => ({ plan: 'standard' as const, expiresAt: new Date(expiresAt) });
  const PRO = CUSTOM_DOMAIN_MONTHLY_PRICE_HBD;
  const STD = MONTHLY_PRICE_HBD;

  it('charges nothing extra for a new, expired or custom-domain blog', () => {
    expect(creditCustomDomainPayment(2 * PRO, 2, null, now)).toEqual({ pro: true, months: 2 });
    expect(
      creditCustomDomainPayment(PRO, 1, { plan: 'pro', expiresAt: new Date('2026-06-15T00:00:00Z') }, now)
    ).toEqual({ pro: true, months: 1 });
    expect(
      creditCustomDomainPayment(PRO, 1, { plan: 'standard', expiresAt: new Date('2026-01-01T00:00:00Z') }, now)
    ).toEqual({ pro: true, months: 1 });
  });

  it('takes the premium for the months left first, then buys months at the custom-domain rate', () => {
    const t = standard('2026-06-15T00:00:00Z'); // 5 months left
    const premium = customDomainUpgradeHbd(t.expiresAt, now);
    expect(creditCustomDomainPayment(premium + 2 * PRO, 2, t, now)).toEqual({ pro: true, months: 2 });
    // The memo asked for more months than the amount covers after the premium.
    expect(creditCustomDomainPayment(premium + 2 * PRO, 3, t, now)).toEqual({ pro: true, months: 2 });
  });

  it('keeps a payment that no longer covers the premium as standard time, never as nothing', () => {
    const quoted = standard('2027-01-15T00:00:00Z'); // 12 months left when quoted
    const paid = customDomainUpgradeHbd(quoted.expiresAt, now) + PRO;
    // Another payment extended the term to 13 months before this one arrived.
    const grown = standard('2027-02-15T00:00:00Z');
    expect(creditCustomDomainPayment(paid, 1, grown, now)).toEqual({
      pro: false,
      months: Math.floor(Math.round(paid * 1000) / Math.round(STD * 1000)),
    });
    // One month at the custom-domain rate on a long standard term: standard months.
    expect(creditCustomDomainPayment(PRO, 1, grown, now)).toEqual({ pro: false, months: 1 });
  });
});

describe('premium on any standard blog with time left', () => {
  it('a suspended blog with time left pays the premium too', () => {
    const t = { plan: 'standard', expiresAt: new Date('2027-01-15T00:00:00Z') };
    expect(creditCustomDomainPayment(CUSTOM_DOMAIN_MONTHLY_PRICE_HBD, 1, t, now)).toEqual({ pro: false, months: 1 });
  });
});

describe('hbdAsTimeMs', () => {
  it('turns an amount into the time it buys at a monthly price', () => {
    const month = (365.2425 / 12) * 24 * 3600 * 1000;
    expect(hbdAsTimeMs(MONTHLY_PRICE_HBD, MONTHLY_PRICE_HBD)).toBe(Math.floor(month));
    expect(hbdAsTimeMs(MONTHLY_PRICE_HBD / 2, MONTHLY_PRICE_HBD)).toBe(Math.floor(month / 2));
    expect(hbdAsTimeMs(0, MONTHLY_PRICE_HBD)).toBe(0);
  });
});

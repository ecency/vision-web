import { describe, expect, it } from 'vitest';
import {
  remainingMonths,
  customDomainUpgradeHbd,
  CUSTOM_DOMAIN_UPGRADE_DELTA_HBD,
  MONTHLY_PRICE_HBD,
  CUSTOM_DOMAIN_MONTHLY_PRICE_HBD,
  creditCustomDomainPayment,
  hbdAsTimeMs,
  renewalPlan,
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
    expect(creditCustomDomainPayment(premium + 2 * PRO, 2, t, now)).toMatchObject({ pro: true, months: 2 });
    // The memo asked for more months than the amount covers after the premium.
    expect(creditCustomDomainPayment(premium + 2 * PRO, 3, t, now)).toMatchObject({ pro: true, months: 2 });
  });

  it('keeps a payment that no longer covers the premium as standard time, never as nothing', () => {
    const quoted = standard('2027-01-15T00:00:00Z'); // 12 months left when quoted
    const paid = customDomainUpgradeHbd(quoted.expiresAt, now) + PRO;
    // Another payment extended the term to 13 months before this one arrived.
    const grown = standard('2027-02-15T00:00:00Z');
    // The whole amount buys standard time, to the millisecond (no remainder dropped), the same as
    // an upgrade memo that no longer applies; `months` is the whole months, for the record.
    expect(creditCustomDomainPayment(paid, 1, grown, now)).toEqual({
      pro: false,
      months: Math.floor(Math.round(paid * 1000) / Math.round(STD * 1000)),
      timeMs: hbdAsTimeMs(paid, STD),
    });
    expect(creditCustomDomainPayment(PRO, 1, grown, now)).toEqual({ pro: false, months: 1, timeMs: hbdAsTimeMs(PRO, STD) });
  });
});

describe('premium on any standard blog with time left', () => {
  it('a suspended blog with time left pays the premium too', () => {
    const t = { plan: 'standard', expiresAt: new Date('2027-01-15T00:00:00Z') };
    expect(creditCustomDomainPayment(CUSTOM_DOMAIN_MONTHLY_PRICE_HBD, 1, t, now)).toMatchObject({ pro: false, months: 1 });
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

describe('a quote-exact payment whose term grew keeps every unit', () => {
  it('credits what is left after the premium and the whole months as time at the custom-domain rate', () => {
    // 18 HBD quoted: 12 months of premium plus two custom-domain months. The term grew to 13 months
    // before it landed: 13 of premium, one month (3), and 2 HBD left over.
    const PRO = CUSTOM_DOMAIN_MONTHLY_PRICE_HBD;
    const grown = { plan: 'standard', expiresAt: new Date(now.getTime() + 13 * 30.4369 * 86400000) };
    const premium = customDomainUpgradeHbd(grown.expiresAt, now);
    const paid = 18;
    const credit = creditCustomDomainPayment(paid, 2, grown, now);
    expect(credit.pro).toBe(true);
    expect(credit.months).toBe(Math.floor((paid - premium) / PRO));
    const left = paid - premium - credit.months * PRO;
    expect(left).toBeGreaterThan(0);
    expect(credit.extraMs).toBe(hbdAsTimeMs(left, PRO));
  });

  it('adds no extra time when the payment is exactly the premium plus whole months', () => {
    const t = { plan: 'standard', expiresAt: new Date('2026-06-15T00:00:00Z') };
    const premium = customDomainUpgradeHbd(t.expiresAt, now);
    expect(creditCustomDomainPayment(premium + 2 * CUSTOM_DOMAIN_MONTHLY_PRICE_HBD, 2, t, now).extraMs ?? 0).toBe(0);
  });
});

describe('a quote whose premium vanished by confirmation keeps every unit', () => {
  it('credits the remainder when the term expired between quote and confirmation', () => {
    // A 4 HBD quote: 1 HBD premium for a term about to end plus one custom-domain month. It is
    // confirmed after expiry, so the premium is 0: one month (3), and 1 HBD left as time.
    const expired = { plan: 'standard', expiresAt: new Date(now.getTime() - 60_000) };
    const credit = creditCustomDomainPayment(4, 1, expired, now);
    expect(credit).toEqual({ pro: true, months: 1, extraMs: hbdAsTimeMs(4 - CUSTOM_DOMAIN_MONTHLY_PRICE_HBD, CUSTOM_DOMAIN_MONTHLY_PRICE_HBD) });
  });

  it('never credits whole months an amount does not cover, premium or not', () => {
    // Should a caller ever send less than months x price (e.g. a raised HBD price above a fixed
    // card price), only what was paid is credited, as exact time.
    const credit = creditCustomDomainPayment(2, 1, null, now);
    expect(credit).toEqual({ pro: true, months: 0, extraMs: hbdAsTimeMs(2, CUSTOM_DOMAIN_MONTHLY_PRICE_HBD) });
  });

  it('adds nothing for an exact payment on a new or custom-domain blog', () => {
    expect(creditCustomDomainPayment(2 * CUSTOM_DOMAIN_MONTHLY_PRICE_HBD, 2, null, now)).toEqual({ pro: true, months: 2 });
    expect(
      creditCustomDomainPayment(CUSTOM_DOMAIN_MONTHLY_PRICE_HBD, 1, { plan: 'pro', expiresAt: new Date('2026-06-15T00:00:00Z') }, now)
    ).toEqual({ pro: true, months: 1 });
  });
});

describe('renewalPlan (#2137)', () => {
  const later = new Date(now.getTime() + 60 * 86400000);
  const earlier = new Date(now.getTime() - 86400000);
  it('prices a renewal of a custom-domain blog that still has its domain at the custom-domain rate', () => {
    expect(renewalPlan({ plan: 'pro', customDomain: 'blog.example.com', expiresAt: earlier }, false, now)).toBe('pro');
  });
  it('keeps a custom-domain blog with time left on that plan even with no domain attached', () => {
    // No payment, from anyone, can take away custom-domain time already paid for.
    expect(renewalPlan({ plan: 'pro', customDomain: null, expiresAt: later }, false, now)).toBe('pro');
  });
  it('renews a custom-domain blog with no domain and no time left as standard', () => {
    expect(renewalPlan({ plan: 'pro', customDomain: null, expiresAt: earlier }, false, now)).toBe('standard');
    expect(renewalPlan({ plan: 'pro', customDomain: null, expiresAt: null }, false, now)).toBe('standard');
  });
  it('follows the add-on when asked for, and standard otherwise', () => {
    expect(renewalPlan({ plan: 'standard', customDomain: null, expiresAt: later }, true, now)).toBe('pro');
    expect(renewalPlan({ plan: 'standard', customDomain: null, expiresAt: later }, false, now)).toBe('standard');
    expect(renewalPlan(null, false, now)).toBe('standard');
  });
});

import { describe, expect, it } from 'vitest';
import {
  customDomainCapability,
  parseGraceDays,
  DEFAULT_PRO_GRACE_DAYS,
} from './subscription';

const NOW = new Date('2026-08-01T00:00:00Z');
const GRACE = 14;

function tenant(over: Partial<Parameters<typeof customDomainCapability>[0]> = {}) {
  return {
    subscriptionPlan: 'pro' as const,
    subscriptionStatus: 'active' as const,
    subscriptionExpiresAt: new Date('2026-09-01T00:00:00Z'),
    ...over,
  };
}

function daysBefore(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * expireSubscriptions flips the status and never touches the plan, so a lapsed tenant kept
 * plan = 'pro' forever and every capability gate that read the plan alone kept saying yes.
 * Status is the source of truth; the plan is deliberately left alone because the origin's
 * certificate sync selects on plan = 'pro' and downgrading would pull a late customer's cert.
 */
describe('customDomainCapability', () => {
  it('allows an active Pro tenant', () => {
    const capability = customDomainCapability(tenant(), NOW, GRACE);
    expect(capability).toMatchObject({ state: 'active', allowed: true });
  });

  it('refuses a tenant that is not on the Pro plan', () => {
    const capability = customDomainCapability(
      tenant({ subscriptionPlan: 'standard' }),
      NOW,
      GRACE
    );
    expect(capability).toMatchObject({ state: 'none', allowed: false });
  });

  it('keeps capabilities through the grace window after expiry', () => {
    // A customer who is a few days late is still renewing; refusing here would block the
    // re-verification that a renewal can need.
    const capability = customDomainCapability(
      tenant({ subscriptionStatus: 'expired', subscriptionExpiresAt: daysBefore(GRACE - 1) }),
      NOW,
      GRACE
    );
    expect(capability).toMatchObject({ state: 'grace', allowed: true });
    expect(capability.graceEndsAt).toBeInstanceOf(Date);
  });

  it('refuses once the grace window has passed', () => {
    const capability = customDomainCapability(
      tenant({ subscriptionStatus: 'expired', subscriptionExpiresAt: daysBefore(GRACE + 1) }),
      NOW,
      GRACE
    );
    expect(capability).toMatchObject({ state: 'lapsed', allowed: false });
  });

  it('gives no grace to a suspended tenant', () => {
    // Suspension is an operator decision, not a late payment.
    const capability = customDomainCapability(
      tenant({ subscriptionStatus: 'suspended', subscriptionExpiresAt: daysBefore(1) }),
      NOW,
      GRACE
    );
    expect(capability).toMatchObject({ state: 'lapsed', allowed: false });
  });

  it('gives no capability to a tenant that was never activated', () => {
    for (const status of ['inactive', 'abandoned'] as const) {
      expect(
        customDomainCapability(tenant({ subscriptionStatus: status }), NOW, GRACE)
      ).toMatchObject({ state: 'lapsed', allowed: false });
    }
  });

  it('fails closed when an expired tenant has no expiry date to measure from', () => {
    const capability = customDomainCapability(
      tenant({ subscriptionStatus: 'expired', subscriptionExpiresAt: null }),
      NOW,
      GRACE
    );
    expect(capability).toMatchObject({ state: 'lapsed', allowed: false });
  });
});

describe('parseGraceDays', () => {
  it('accepts a positive integer', () => {
    expect(parseGraceDays('21', DEFAULT_PRO_GRACE_DAYS)).toBe(21);
    expect(parseGraceDays('  7  ', DEFAULT_PRO_GRACE_DAYS)).toBe(7);
  });

  it('falls back for anything that is not a positive integer', () => {
    // A zero or negative window would refuse (or release) the moment a subscription lapsed.
    for (const raw of ['0', '-1', 'abc', '', '13.9', '7foo', '1e3', undefined]) {
      expect(parseGraceDays(raw, DEFAULT_PRO_GRACE_DAYS)).toBe(DEFAULT_PRO_GRACE_DAYS);
    }
  });
});

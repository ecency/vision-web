import { beforeEach, describe, expect, it, vi } from 'vitest';

// The custom-domain quote for an existing standard blog with time left carries
// the prorated premium for that time, the same amount the payment listener
// requires, so a payment made exactly as quoted is credited as quoted.

const mocks = vi.hoisted(() => ({ getByUsername: vi.fn() }));
vi.mock('../services/tenant-service', () => ({
  TenantService: { getByUsername: (...a: unknown[]) => mocks.getByUsername(...a) },
}));
vi.mock('../db/client', () => ({ db: { query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn() } }));

const { paymentRoutes } = await import('./payments');
const Pricing = await import('../pricing');

const IN_A_YEAR = new Date(Date.now() + 12 * 30.5 * 24 * 3600 * 1000);
const quote = async (query: string) =>
  (await (await paymentRoutes.request(`/instructions/alice?${query}`)).json()) as {
    amount: string;
    memo: string;
    months: number;
  };
const hbdOf = (s: string) => Number.parseFloat(s);

describe('GET /instructions with the custom-domain add-on', () => {
  beforeEach(() => mocks.getByUsername.mockReset());

  it('adds the premium for the months left on a standard blog', async () => {
    mocks.getByUsername.mockResolvedValue({
      username: 'alice',
      subscriptionPlan: 'standard',
      subscriptionStatus: 'active',
      subscriptionExpiresAt: IN_A_YEAR,
    });
    const q = await quote('months=1&domain=1');
    const premium = Pricing.customDomainUpgradeHbd(IN_A_YEAR, new Date());
    expect(premium).toBeGreaterThan(0);
    expect(hbdOf(q.amount)).toBeCloseTo(Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD + premium, 3);
    expect(q.memo).toBe('blog:alice:domain');
  });

  it('adds the premium for a suspended standard blog with time left too', async () => {
    mocks.getByUsername.mockResolvedValue({
      username: 'alice',
      subscriptionPlan: 'standard',
      subscriptionStatus: 'suspended',
      subscriptionExpiresAt: IN_A_YEAR,
    });
    const q = await quote('months=1&domain=1');
    const premium = Pricing.customDomainUpgradeHbd(IN_A_YEAR, new Date());
    expect(hbdOf(q.amount)).toBeCloseTo(Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD + premium, 3);
  });

  it.each([
    ['a new blog', null],
    ['a blog already on the plan', { subscriptionPlan: 'pro', subscriptionStatus: 'active', subscriptionExpiresAt: IN_A_YEAR }],
    ['an expired blog', { subscriptionPlan: 'standard', subscriptionStatus: 'expired', subscriptionExpiresAt: new Date(Date.now() - 86400000) }],
  ])('quotes the plain monthly price for %s', async (_label, tenant) => {
    mocks.getByUsername.mockResolvedValue(tenant);
    const q = await quote('months=2&domain=1');
    expect(hbdOf(q.amount)).toBeCloseTo(2 * Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD, 3);
  });

  it('quotes the standard price without the add-on, whatever the blog', async () => {
    mocks.getByUsername.mockResolvedValue({
      subscriptionPlan: 'standard',
      subscriptionStatus: 'active',
      subscriptionExpiresAt: IN_A_YEAR,
    });
    const q = await quote('months=1');
    expect(hbdOf(q.amount)).toBeCloseTo(Pricing.MONTHLY_PRICE_HBD, 3);
  });
});

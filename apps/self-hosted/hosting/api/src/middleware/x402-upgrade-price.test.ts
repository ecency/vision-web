import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';

// The x402 custom-domain upgrade asks for the premium for the months left on
// the current term, the same amount an HBD upgrade pays, not a flat price.

const { proUpgradePaywall } = await import('./x402-paywall');
const Pricing = await import('../pricing');

function app(premium: number | undefined) {
  const a = new Hono();
  a.post(
    '/upgrade',
    async (c, next) => {
      if (premium !== undefined) c.set('upgradePremium', premium);
      await next();
    },
    proUpgradePaywall,
    (c) => c.json({ ok: true })
  );
  return a;
}

describe('x402 custom-domain upgrade price', () => {
  it('asks for the prorated premium for the months left', async () => {
    const expiry = new Date(Date.now() + 5 * 30.5 * 24 * 3600 * 1000);
    const premium = Pricing.customDomainUpgradeHbd(expiry, new Date());
    const res = await app(premium).request('/upgrade', { method: 'POST' });
    expect(res.status).toBe(402);
    const body = (await res.json()) as { accepts: { maxAmountRequired: string }[] };
    expect(body.accepts[0].maxAmountRequired).toBe(`${Pricing.hbd(premium)} HBD`);
  });

  it('refuses to take a payment when there is no term to upgrade', async () => {
    const res = await app(0).request('/upgrade', { method: 'POST' });
    expect(res.status).toBe(400);
  });

  it('refuses when the route did not price the upgrade', async () => {
    const res = await app(undefined).request('/upgrade', { method: 'POST' });
    expect(res.status).toBe(400);
  });
});

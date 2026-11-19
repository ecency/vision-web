import { beforeEach, describe, expect, it, vi } from 'vitest';

// The x402 upgrade is priced before its payment settles. Another payment can
// extend the term in between; the locked row then needs a larger premium than
// was paid, so the blog keeps the payment as standard time instead of moving
// the longer term to the custom-domain plan for less.

const { applyX402Upgrade } = await import('./x402-upgrade');
const Pricing = await import('../pricing');

type Call = { sql: string; params: unknown[] };
const calls: Call[] = [];
let row: Record<string, unknown>;
const client = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/FROM tenants WHERE username/.test(sql)) return { rowCount: 1, rows: [row] };
    if (/INSERT INTO payments/.test(sql)) return { rowCount: 1, rows: [] };
    if (/UPDATE tenants/.test(sql)) return { rowCount: 1, rows: [{ ...row, updated: true }] };
    return { rowCount: 0, rows: [] };
  }),
};

const inMonths = (n: number) => new Date(Date.now() + n * 30.5 * 24 * 3600 * 1000);
const input = (paid: number) => ({ username: 'alice', txId: 'tx1', blockNum: 0, payer: 'alice', paid });
const flip = () => calls.find((c) => /SET subscription_plan = 'pro'/.test(c.sql));
const extension = () => calls.find((c) => /SET subscription_expires_at = GREATEST/.test(c.sql));

describe('applyX402Upgrade', () => {
  beforeEach(() => {
    calls.length = 0;
    row = { id: 't1', subscription_status: 'active', subscription_plan: 'standard', subscription_expires_at: inMonths(2) };
  });

  it('moves the term to the plan when the paid premium still covers it', async () => {
    const paid = Pricing.customDomainUpgradeHbd(row.subscription_expires_at as Date, new Date());
    const out = await applyX402Upgrade(client, input(paid), new Date());
    expect(flip()).toBeTruthy();
    expect(extension()).toBeUndefined();
    expect(out.keptAsTime).toBe(false);
  });

  it('keeps the payment as standard time when the term grew after it was priced', async () => {
    const paid = Pricing.customDomainUpgradeHbd(row.subscription_expires_at as Date, new Date());
    row.subscription_expires_at = inMonths(14); // a 12-month renewal landed meanwhile
    const out = await applyX402Upgrade(client, input(paid), new Date());
    expect(flip()).toBeUndefined();
    expect(extension()?.params[1]).toBe(Pricing.hbdAsTimeMs(paid, Pricing.MONTHLY_PRICE_HBD));
    expect(out.keptAsTime).toBe(true);
  });

  it('keeps the payment as time on the plan when another payment upgraded the blog first', async () => {
    row.subscription_plan = 'pro';
    const out = await applyX402Upgrade(client, input(2), new Date());
    expect(flip()).toBeUndefined();
    expect(extension()?.params[1]).toBe(Pricing.hbdAsTimeMs(2, Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD));
    expect(out.keptAsTime).toBe(true);
  });

  it('extends from the later of now and the stored expiry', async () => {
    // A missing or past expiry must still receive the whole time paid for.
    row.subscription_expires_at = inMonths(14);
    await applyX402Upgrade(client, input(0.5), new Date());
    expect(extension()?.sql).toMatch(/GREATEST\(COALESCE\(subscription_expires_at, NOW\(\)\), NOW\(\)\)/);
  });

  it('records the amount that was charged', async () => {
    await applyX402Upgrade(client, input(1.5), new Date());
    expect(calls.find((c) => /INSERT INTO payments/.test(c.sql))?.params[4]).toBe(1.5);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

// A card order for the custom-domain plan follows the same rule as an HBD
// payment: on a standard blog with time left it first pays the premium for the
// months already paid at the standard rate. A fixed-price order that cannot
// cover it is kept as standard time; it never moves the whole term for free.

const INTERNAL_SECRET = 'test-internal-secret-of-32-chars!!';

type Call = { sql: string; params: unknown[] };
const calls: Call[] = [];
let tenantRow: Record<string, unknown>;
let existingPayment: Record<string, unknown> | null;

const client = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/FROM tenants WHERE username/.test(sql)) return { rowCount: 1, rows: [tenantRow] };
    if (/INSERT INTO payments/.test(sql)) {
      return existingPayment ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [{ id: 'p1' }] };
    }
    if (/FROM payments WHERE trx_id/.test(sql)) return { rowCount: 1, rows: [existingPayment] };
    return { rowCount: 1, rows: [] };
  }),
};

vi.mock('../db/client', () => ({
  db: { transaction: vi.fn(async (fn: (c: typeof client) => Promise<unknown>) => fn(client)) },
}));
vi.mock('../services/tenant-service', () => ({
  TenantService: {
    getByUsername: vi.fn(async () => ({ id: 't1', username: 'alice', subscriptionStatus: 'active' })),
  },
  ABANDONED_REREGISTER_QUARANTINE_HOURS: 24,
  CAUGHT_UP_SQL: 'TRUE',
  DomainInUseError: class extends Error {},
}));
vi.mock('../services/config-service', () => ({
  ConfigService: { generateConfigFile: vi.fn(async () => '/configs/alice.json'), publishConfigFile: vi.fn() },
}));
vi.mock('../services/domain-service', () => ({ DomainService: {} }));
vi.mock('../utils/cors-domains', () => ({ addVerifiedDomainOrigin: vi.fn() }));
vi.mock('../services/audit-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/audit-service')>()),
  AuditService: { log: vi.fn() },
}));

const { internalRoutes } = await import('./internal');
const Pricing = await import('../pricing');

const inMonths = (n: number) => new Date(Date.now() + n * 30.5 * 24 * 3600 * 1000);

async function activate(months: number, amountUsd: number) {
  const res = await internalRoutes.request('/activate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
    body: JSON.stringify({ username: 'alice', payer: 'alice', months, order_id: 'order-1', amount_usd: amountUsd, plan: 'pro' }),
  });
  return { status: res.status, body: (await res.json()) as { plan?: string; keptAsStandard?: boolean } };
}
const planFlips = () => calls.filter((c) => /SET subscription_plan = 'pro'/.test(c.sql));
const claim = () => calls.find((c) => /INSERT INTO payments/.test(c.sql));
const extendedTo = () =>
  calls.find((c) => /SET subscription_status/.test(c.sql))?.params[2] as Date | undefined;

describe('POST /activate with the custom-domain plan', () => {
  beforeEach(() => {
    process.env.HOSTING_INTERNAL_SECRET = INTERNAL_SECRET;
    calls.length = 0;
    existingPayment = null;
    tenantRow = {
      id: 't1',
      owner: 'alice',
      subscription_started_at: new Date(),
      subscription_expires_at: inMonths(12),
      subscription_plan: 'standard',
      subscription_status: 'active',
    };
  });

  it('does not move a long standard term to the plan for one month at the custom-domain price', async () => {
    const { status, body } = await activate(1, Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD);
    expect(status).toBe(200);
    expect(planFlips()).toHaveLength(0);
    expect(body.plan).toBe('standard');
    // Said explicitly, so the caller can tell it from a service that ignored the plan.
    expect(body.keptAsStandard).toBe(true);
    // The whole amount is kept as standard time, to the millisecond.
    expect(claim()?.params.at(-1)).toBe(1);
    const from = tenantRow.subscription_expires_at as Date;
    expect(extendedTo()!.getTime() - from.getTime()).toBe(
      Pricing.hbdAsTimeMs(Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD, Pricing.MONTHLY_PRICE_HBD)
    );
  });

  it('moves the term when the order covers the premium for the months left', async () => {
    const premium = Pricing.customDomainUpgradeHbd(tenantRow.subscription_expires_at as Date, new Date());
    const { body } = await activate(1, premium + Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD);
    expect(planFlips()).toHaveLength(1);
    expect(body.plan).toBe('pro');
    expect(body.keptAsStandard).toBeUndefined();
    expect(claim()?.params.at(-1)).toBe(1);
  });

  it('charges no premium on a blog with no time left', async () => {
    tenantRow.subscription_status = 'expired';
    tenantRow.subscription_expires_at = new Date(Date.now() - 86400000);
    const { body } = await activate(1, Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD);
    expect(planFlips()).toHaveLength(1);
    expect(body.plan).toBe('pro');
  });

  it('records an order kept as standard with an explicit marker', async () => {
    await activate(1, Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD);
    expect(claim()?.params[3]).toBe('blog:alice:1:standard');
  });

  it('a replay of an order recorded before the markers reports no keptAsStandard', async () => {
    // Older rows carry no suffix even when they did upgrade; only the explicit marker counts.
    existingPayment = { tenant_id: 't1', memo: 'blog:alice:1' };
    tenantRow.subscription_plan = 'pro';
    const { body } = await activate(1, Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD);
    expect(body.plan).toBe('pro');
    expect(body.keptAsStandard).toBeUndefined();
  });

  it('a replay keeps the first decision and never flips the plan later', async () => {
    existingPayment = { tenant_id: 't1', memo: 'blog:alice:1:standard' };
    const { body } = await activate(1, Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD);
    expect(planFlips()).toHaveLength(0);
    expect(body.plan).toBe('standard');
    expect(body.keptAsStandard).toBe(true);
    expect(extendedTo()).toBeUndefined();
  });

  it('a replay of an order that moved the term re-applies the plan', async () => {
    existingPayment = { tenant_id: 't1', memo: 'blog:alice:1:domain' };
    const { body } = await activate(1, Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD);
    expect(planFlips()).toHaveLength(1);
    expect(body.plan).toBe('pro');
  });
});

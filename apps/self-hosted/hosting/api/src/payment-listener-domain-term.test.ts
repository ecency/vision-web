import { beforeEach, describe, expect, it, vi } from 'vitest';

// A ':domain' payment on a standard blog with time left upgrades the whole term
// to the custom-domain plan. It must carry the prorated premium for the months
// already paid at the standard rate, the same amount the upgrade quote asks
// for, or one month's premium would buy custom domains for the full term.

vi.mock('@ecency/sdk/hive', () => ({ callRPC: vi.fn(), config: { nodes: [] }, setNodes: vi.fn() }));
vi.mock('./services/audit-service', () => ({ AuditService: { log: vi.fn() } }));
vi.mock('./services/tenant-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/tenant-service')>();
  return {
    ...actual,
    TenantService: {
      ...actual.TenantService,
      accountExistsStrict: vi.fn(async () => true),
      buildConfig: vi.fn(async () => ({})),
    },
  };
});
vi.mock('./services/config-service', () => ({
  ConfigService: { publishConfigFile: vi.fn() },
  isPublishableTenant: () => true,
}));

type Call = { sql: string; params: unknown[] };
const calls: Call[] = [];
let tenantRow: Record<string, unknown> | undefined;
// When set, the first tenant lookup finds nothing and the insert conflicts: another request
// created and activated the blog while this payment was being processed.
let createdConcurrently: Record<string, unknown> | undefined;

const client = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/SELECT \* FROM tenants/.test(sql)) {
      if (createdConcurrently && !calls.some((c, i) => i < calls.length - 1 && /SELECT \* FROM tenants/.test(c.sql))) {
        return { rows: [] };
      }
      return { rows: createdConcurrently ? [createdConcurrently] : tenantRow ? [tenantRow] : [] };
    }
    if (/INSERT INTO tenants/.test(sql)) return { rows: [] };
    if (/INSERT INTO payments/.test(sql)) return { rows: [{ id: 'p1' }] };
    if (/UPDATE tenants/.test(sql)) return { rows: [{ ...tenantRow, subscription_plan: params[3] ?? 'standard' }] };
    return { rows: [] };
  }),
};
const logged: unknown[][] = [];
vi.mock('./db/client', () => ({
  db: {
    query: vi.fn(async (...args: unknown[]) => {
      logged.push(args);
      return { rows: [] };
    }),
    queryOne: vi.fn(),
    queryAll: vi.fn(),
    transaction: vi.fn(async (fn: (c: typeof client) => Promise<unknown>) => fn(client)),
  },
}));

const { PaymentListener } = await import('./payment-listener');
const { AuditService } = await import('./services/audit-service');
const Pricing = await import('./pricing');

const months = (n: number) => new Date(Date.now() + n * 30.5 * 24 * 3600 * 1000).toISOString();
const transfer = { trxId: 'tx1', blockNum: 1, from: 'alice', memo: 'blog:alice:domain' };

function pay(amount: number, credited: number, requested = 1) {
  const listener = new PaymentListener() as unknown as {
    processSubscription: (t: unknown, u: string, m: number, a: number, pro: boolean, min: number) => Promise<void>;
  };
  return listener.processSubscription(transfer, 'alice', credited, amount, true, requested);
}
const planUpdate = () => calls.find((c) => /UPDATE tenants/.test(c.sql));
// What the upgrade quote asks for the months left on this term.
const premium = () =>
  Pricing.customDomainUpgradeHbd(new Date(String(tenantRow!.subscription_expires_at)), new Date());
const failedPayments = () => logged.filter((args) => (args[1] as unknown[] | undefined)?.includes('failed'));

describe('a custom-domain payment on a standard blog with time left', () => {
  beforeEach(() => {
    calls.length = 0;
    logged.length = 0;
    createdConcurrently = undefined;
    tenantRow = {
      id: 't1',
      username: 'alice',
      owner: 'alice',
      subscription_status: 'active',
      subscription_plan: 'standard',
      subscription_started_at: new Date().toISOString(),
      subscription_expires_at: months(12),
    };
  });

  // Months credited are recorded when the payment is marked processed, priced on the final row.
  const credited = () => calls.find((c) => /status = 'processed'/.test(c.sql))?.params[3];

  it('does not make the whole term custom-domain for one month at that rate', async () => {
    await pay(Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD, 1);
    // Kept as standard time: the plan is untouched, nothing is refused.
    expect(planUpdate()?.params[3]).toBeNull();
    expect(credited()).toBe(1);
    expect(failedPayments()).toHaveLength(0);
  });

  it('credits the quoted amount even when another payment grew the term after the quote', async () => {
    const quotedPremium = premium(); // 12 months left when the quote was made
    tenantRow!.subscription_expires_at = months(13); // a renewal landed before this transfer
    const paid = quotedPremium + Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD;
    await pay(paid, 1);
    expect(failedPayments()).toHaveLength(0);
    expect(planUpdate()?.params[3]).toBeNull();
    expect(credited()).toBe(Math.floor(Math.round(paid * 1000) / Math.round(Pricing.MONTHLY_PRICE_HBD * 1000)));
    // The term is extended by the exact time the amount buys at the standard rate.
    const extendedTo = planUpdate()?.params[2] as Date;
    const from = new Date(String(createdConcurrently?.subscription_expires_at ?? tenantRow!.subscription_expires_at));
    expect(extendedTo.getTime() - from.getTime()).toBe(Pricing.hbdAsTimeMs(paid, Pricing.MONTHLY_PRICE_HBD));
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'payment.processed',
        eventData: expect.objectContaining({ customDomainKeptAsStandard: true }),
      })
    );
  });

  it('upgrades when the payment covers the premium for the months left plus the new month', async () => {
    // The premium for the months left, plus one month at the custom-domain rate.
    await pay(premium() + Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD, 5);
    expect(planUpdate()?.params[3]).toBe('pro');
  });

  it('credits only the months left after the premium', async () => {
    await pay(premium() + 2 * Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD, 6);
    expect(credited()).toBe(2);
  });

  it('credits the months the payment covers when that is fewer than the memo asked for', async () => {
    await pay(premium() + Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD, 3, 3);
    expect(planUpdate()?.params[3]).toBe('pro');
    expect(credited()).toBe(1);
    expect(failedPayments()).toHaveLength(0);
  });

  it('prices the premium on a blog another request created and activated meanwhile', async () => {
    // The first lookup finds no blog; by the insert, a running standard term exists.
    createdConcurrently = { ...tenantRow!, subscription_expires_at: months(12) };
    tenantRow = undefined;
    await pay(Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD, 1);
    expect(planUpdate()?.params[3]).toBeNull();
    expect(credited()).toBe(1);
  });

  it('needs no premium on a blog that is already on the custom-domain plan', async () => {
    tenantRow!.subscription_plan = 'pro';
    await pay(Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD, 1);
    expect(planUpdate()?.params[3]).toBe('pro');
  });

  it('needs no premium on a blog with no time left', async () => {
    tenantRow!.subscription_status = 'expired';
    tenantRow!.subscription_expires_at = new Date(Date.now() - 86400000).toISOString();
    await pay(Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD, 1);
    expect(planUpdate()?.params[3]).toBe('pro');
  });
});

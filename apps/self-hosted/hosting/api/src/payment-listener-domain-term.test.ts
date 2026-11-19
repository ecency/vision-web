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
      // The pre-check before a transaction reads the blog the transfer names.
      getByUsername: vi.fn(async () =>
        tenantRow
          ? {
              username: tenantRow.username,
              subscriptionPlan: tenantRow.subscription_plan,
              subscriptionStatus: tenantRow.subscription_status,
              subscriptionExpiresAt: tenantRow.subscription_expires_at,
              customDomain: tenantRow.custom_domain ?? null,
            }
          : null
      ),
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

function pay(amount: number, credited: number, requested = 1, domainMemo = true) {
  const listener = new PaymentListener() as unknown as {
    processSubscription: (t: unknown, u: string, m: number, a: number, pro: boolean, min: number) => Promise<void>;
  };
  return listener.processSubscription(transfer, 'alice', credited, amount, domainMemo, requested);
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

  it('keeps the remainder of a quote-exact payment whose term grew, as custom-domain time', async () => {
    // 18 HBD was quoted for 12 months of premium plus two custom-domain months; the term grew to
    // 13 months before it landed: 13 of premium, one month (3), and the rest as exact time.
    tenantRow!.subscription_expires_at = months(13);
    const from = new Date(String(tenantRow!.subscription_expires_at));
    const paid = 18;
    await pay(paid, Math.floor(paid / Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD), 2);
    const prem = Pricing.customDomainUpgradeHbd(from, new Date());
    const credit = Pricing.creditCustomDomainPayment(paid, 6, { plan: 'standard', expiresAt: from }, new Date());
    expect(planUpdate()?.params[3]).toBe('pro');
    expect(credited()).toBe(credit.months);
    const expected = new Date(from);
    expected.setMonth(expected.getMonth() + credit.months);
    const left = paid - prem - credit.months * Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD;
    expect(left).toBeGreaterThan(0);
    const extendedTo = planUpdate()?.params[2] as Date;
    expect(extendedTo.getTime()).toBe(expected.getTime() + Pricing.hbdAsTimeMs(left, Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD));
    expect(failedPayments()).toHaveLength(0);
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

describe('a plain renewal of a blog on the custom-domain plan (#2137)', () => {
  const STD = Pricing.MONTHLY_PRICE_HBD;
  const PRO = Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD;
  beforeEach(() => {
    calls.length = 0;
    logged.length = 0;
    createdConcurrently = undefined;
    tenantRow = {
      id: 't1',
      username: 'alice',
      owner: 'alice',
      subscription_status: 'active',
      subscription_plan: 'pro',
      custom_domain: 'blog.alice.example',
      subscription_started_at: new Date().toISOString(),
      subscription_expires_at: months(2),
    };
  });
  const update = () => calls.find((c) => /UPDATE tenants/.test(c.sql));
  const creditedMonths = () => calls.find((c) => /status = 'processed'/.test(c.sql))?.params[3];

  it('with its domain, is priced at the custom-domain rate: the standard amount buys the time it pays for', async () => {
    const from = new Date(String(tenantRow!.subscription_expires_at));
    await pay(STD, Math.floor(STD / STD), 1, false);
    expect(update()?.params[3]).toBe('pro');
    expect(creditedMonths()).toBe(0);
    expect((update()?.params[2] as Date).getTime() - from.getTime()).toBe(Pricing.hbdAsTimeMs(STD, PRO));
  });

  it('with its domain, a full custom-domain month is one month', async () => {
    await pay(PRO, Math.floor(PRO / STD), 1, false);
    expect(update()?.params[3]).toBe('pro');
    expect(creditedMonths()).toBe(1);
  });

  it('without a domain but with time left, stays on the plan: a gift cannot take away paid time', async () => {
    tenantRow!.custom_domain = null;
    await pay(Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD, 1, 1, false);
    expect(update()?.params[3]).toBe('pro');
    expect(creditedMonths()).toBe(1);
  });

  it('without a domain and with no time left, renews as standard and goes back to standard', async () => {
    tenantRow!.custom_domain = null;
    tenantRow!.subscription_status = 'expired';
    tenantRow!.subscription_expires_at = new Date(Date.now() - 86400000).toISOString();
    await pay(STD, 1, 1, false);
    expect(update()?.params[3]).toBe('standard');
    expect(creditedMonths()).toBe(1);
  });

  it('a standard blog renewing plainly keeps its plan untouched', async () => {
    tenantRow!.subscription_plan = 'standard';
    tenantRow!.custom_domain = null;
    await pay(STD, 1, 1, false);
    expect(update()?.params[3]).toBeNull();
  });
});

describe('a short or uneven payment keeps its value (#2137)', () => {
  const STD = Pricing.MONTHLY_PRICE_HBD;
  const PRO = Pricing.CUSTOM_DOMAIN_MONTHLY_PRICE_HBD;
  const send = (amount: number, memo: string) => {
    const listener = new PaymentListener() as unknown as { processTransfer: (t: unknown) => Promise<void> };
    return listener.processTransfer({
      trxId: 'tx9', blockNum: 1, from: 'bob', to: 'ecency.hosting',
      amount: `${amount.toFixed(3)} HBD`, memo, timestamp: new Date().toISOString(),
    });
  };
  const update = () => calls.find((c) => /UPDATE tenants/.test(c.sql));
  beforeEach(() => {
    calls.length = 0;
    logged.length = 0;
    createdConcurrently = undefined;
    tenantRow = {
      id: 't1', username: 'alice', owner: 'alice',
      subscription_status: 'active', subscription_plan: 'pro', custom_domain: 'blog.alice.example',
      subscription_started_at: new Date().toISOString(), subscription_expires_at: months(2),
    };
  });

  it('a blog on the custom-domain plan takes less than a month at its rate as time, not a refusal', async () => {
    const from = new Date(String(tenantRow!.subscription_expires_at));
    await send(1, 'blog:alice');
    expect(failedPayments()).toHaveLength(0);
    expect(update()?.params[3]).toBe('pro');
    expect((update()?.params[2] as Date).getTime() - from.getTime()).toBe(Pricing.hbdAsTimeMs(1, PRO));
  });

  it('a 2 HBD custom-domain memo on such a blog is time too', async () => {
    await send(2, 'blog:alice:domain');
    expect(failedPayments()).toHaveLength(0);
    expect(update()?.params[3]).toBe('pro');
  });

  it('a plain renewal that ends up standard keeps the remainder as standard time', async () => {
    // Quoted 3 HBD while the term ran with no domain; the term ended before the transfer landed.
    tenantRow!.custom_domain = null;
    tenantRow!.subscription_status = 'expired';
    tenantRow!.subscription_expires_at = new Date(Date.now() - 60_000).toISOString();
    await send(3, 'blog:alice');
    expect(failedPayments()).toHaveLength(0);
    expect(update()?.params[3]).toBe('standard');
    const extended = update()?.params[2] as Date;
    const oneMonth = new Date();
    oneMonth.setMonth(oneMonth.getMonth() + 1);
    // One month plus the 1 HBD remainder at the standard rate (within the test's own timing).
    expect(Math.abs(extended.getTime() - (oneMonth.getTime() + Pricing.hbdAsTimeMs(1, STD)))).toBeLessThan(5_000);
  });

  it.each(['inactive', 'abandoned'])('a dust payment cannot activate an %s reservation', async (status) => {
    // A reservation or an abandoned name has never run: a few thousandths of a HBD must not pin it.
    tenantRow!.subscription_status = status;
    tenantRow!.subscription_plan = 'standard';
    tenantRow!.custom_domain = null;
    tenantRow!.subscription_expires_at = null as unknown as string;
    await send(0.001, 'blog:alice');
    expect(update()).toBeUndefined();
    expect(failedPayments()).toHaveLength(1);
  });

  it('a brand-new blog still needs at least one month', async () => {
    tenantRow = undefined;
    await send(1, 'blog:newcomer');
    expect(failedPayments()).toHaveLength(1);
  });
});

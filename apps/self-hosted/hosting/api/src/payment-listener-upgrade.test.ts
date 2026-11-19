import { beforeEach, describe, expect, it, vi } from 'vitest';

// processUpgrade must apply the standard->Pro flip and the payment record in ONE transaction, so a
// transient failure or a duplicate block can never leave a Pro tenant with a failed/missing
// payment. These tests drive the private method against a fake transaction client and assert the
// exact SQL sequence: claim (dedup) -> eligibility under the row lock -> flip -> mark processed,
// with any ineligible/duplicate/underpaid transfer taking a tenant-untouched path.

vi.mock('@ecency/sdk/hive', () => ({
  callRPC: vi.fn(),
  config: { nodes: [] },
  setNodes: vi.fn(),
}));

// A fake transaction client: each test programs a queue of results keyed by a substring of the SQL.
type Row = Record<string, any>;
let plan: Array<{ match: RegExp; rows: Row[] }>;
const queries: string[] = [];

function makeClient() {
  return {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      const hit = plan.find((p) => p.match.test(sql));
      return { rows: hit ? hit.rows : [], rowCount: hit ? hit.rows.length : 0 };
    }),
  };
}

const auditLog = vi.fn();
vi.mock('./services/audit-service', () => ({ AuditService: { log: (...a: any[]) => auditLog(...a) } }));

// A real-ish db.transaction that runs the callback against the fake client (BEGIN/COMMIT elided).
const client = makeClient();
vi.mock('./db/client', () => ({
  db: {
    query: vi.fn(),
    queryOne: vi.fn(),
    queryAll: vi.fn(),
    transaction: vi.fn(async (fn: (c: any) => Promise<any>) => fn(client)),
  },
}));

const { PaymentListener } = await import('./payment-listener');

// One month from now keeps remainingMonths() >= 1 and the prorated amount modest.
const IN_A_MONTH = new Date(Date.now() + 40 * 24 * 3600 * 1000).toISOString();
const transfer = { trxId: 'tx1', blockNum: 1, from: 'alice', memo: 'upgrade:alice' };

function run(amount: number) {
  const listener: any = new PaymentListener();
  return listener.processUpgrade(transfer, 'alice', amount);
}

function lastTenantUpdate() {
  return queries.find((q) => /UPDATE tenants/.test(q) && /subscription_plan = 'pro'/.test(q));
}
function paymentStatuses() {
  return queries
    .filter((q) => /UPDATE payments SET status/.test(q))
    .map((q) => (/'processed'/.test(q) ? 'processed' : /'failed'/.test(q) ? 'failed' : '?'));
}

describe('PaymentListener.processUpgrade (transactional)', () => {
  beforeEach(() => {
    queries.length = 0;
    client.query.mockClear();
    auditLog.mockClear();
  });

  it('claims, flips to Pro, and marks the payment processed for an eligible active standard tenant', async () => {
    plan = [
      { match: /SELECT \* FROM tenants/, rows: [{ id: 't1', subscription_status: 'active', subscription_plan: 'standard', subscription_expires_at: IN_A_MONTH }] },
      { match: /INSERT INTO payments/, rows: [{ id: 'p1' }] },
      { match: /UPDATE tenants/, rows: [{ id: 't1' }] },
    ];
    await run(10);
    // Claimed as 'processing' with dedup, flipped to Pro, then payment set 'processed'.
    expect(queries.some((q) => /INSERT INTO payments[\s\S]*ON CONFLICT \(trx_id\) DO NOTHING/.test(q))).toBe(true);
    expect(lastTenantUpdate()).toBeTruthy();
    expect(paymentStatuses()).toEqual(['processed']);
    expect(auditLog).toHaveBeenCalledOnce();
  });

  it('does nothing when the transfer is a duplicate (claim returns no row)', async () => {
    plan = [
      { match: /SELECT \* FROM tenants/, rows: [{ id: 't1', subscription_status: 'active', subscription_plan: 'standard', subscription_expires_at: IN_A_MONTH }] },
      { match: /INSERT INTO payments/, rows: [] }, // ON CONFLICT DO NOTHING -> already processed
    ];
    await run(10);
    expect(lastTenantUpdate()).toBeUndefined();
    expect(paymentStatuses()).toEqual([]); // no processed/failed write
    expect(auditLog).not.toHaveBeenCalled();
  });

  const timeExtension = () => queries.find((q) => /SET subscription_expires_at = subscription_expires_at \+/.test(q));

  it('keeps an upgrade payment to a blog already on the plan as time at the custom-domain rate', async () => {
    plan = [
      { match: /SELECT \* FROM tenants/, rows: [{ id: 't1', subscription_status: 'active', subscription_plan: 'pro', subscription_expires_at: IN_A_MONTH }] },
      { match: /INSERT INTO payments/, rows: [{ id: 'p1' }] },
      { match: /SET subscription_expires_at = subscription_expires_at/, rows: [{ id: 't1' }] },
    ];
    await run(10);
    expect(lastTenantUpdate()).toBeUndefined();
    expect(timeExtension()).toBeTruthy();
    expect(paymentStatuses()).toEqual(['processed']);
  });

  it('fails the payment without touching the tenant when not active', async () => {
    plan = [
      { match: /SELECT \* FROM tenants/, rows: [{ id: 't1', subscription_status: 'expired', subscription_plan: 'standard', subscription_expires_at: IN_A_MONTH }] },
      { match: /INSERT INTO payments/, rows: [{ id: 'p1' }] },
    ];
    await run(10);
    expect(lastTenantUpdate()).toBeUndefined();
    expect(paymentStatuses()).toEqual(['failed']);
  });

  it('keeps a transfer that no longer covers the premium as standard time, without upgrading', async () => {
    // The term grew (another payment) after the upgrade quote was made.
    plan = [
      { match: /SELECT \* FROM tenants/, rows: [{ id: 't1', subscription_status: 'active', subscription_plan: 'standard', subscription_expires_at: IN_A_MONTH }] },
      { match: /INSERT INTO payments/, rows: [{ id: 'p1' }] },
      { match: /SET subscription_expires_at = subscription_expires_at/, rows: [{ id: 't1' }] },
    ];
    await run(0.5); // below the prorated premium
    expect(lastTenantUpdate()).toBeUndefined();
    expect(timeExtension()).toBeTruthy();
    expect(paymentStatuses()).toEqual(['processed']);
  });

  it('flips only under the full eligibility predicate (standard + active + unexpired)', async () => {
    plan = [
      { match: /SELECT \* FROM tenants/, rows: [{ id: 't1', subscription_status: 'active', subscription_plan: 'standard', subscription_expires_at: IN_A_MONTH }] },
      { match: /INSERT INTO payments/, rows: [{ id: 'p1' }] },
      { match: /UPDATE tenants/, rows: [{ id: 't1' }] },
    ];
    await run(10);
    const sql = lastTenantUpdate()!;
    expect(sql).toMatch(/subscription_plan = 'standard'/);
    expect(sql).toMatch(/subscription_status = 'active'/);
    expect(sql).toMatch(/subscription_expires_at > NOW\(\)/);
  });
});

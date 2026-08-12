import { beforeEach, describe, expect, it, vi } from 'vitest';

// reclaimAbandonedTenants SOFT-deletes: one parameterized UPDATE ... SET status='abandoned'
// ... RETURNING. Assert the query shape (it marks, never DELETEs; keeps the status + grace-window
// + no-payments guards) and that it returns the reclaimed usernames. create() upserts so a
// reclaimed username can be reserved again — assert it revives an 'abandoned' row and reports a
// conflict when a live tenant holds the name.
const mocks = vi.hoisted(() => ({ queryAll: vi.fn(), queryOne: vi.fn() }));

vi.mock('../db/client', () => ({
  db: { queryAll: mocks.queryAll, queryOne: mocks.queryOne },
}));
vi.mock('@ecency/sdk/hive', () => ({
  callRPC: vi.fn(),
  config: { nodes: [] },
  setNodes: vi.fn(),
}));

const { TenantService, isReregisterableAbandoned, ABANDONED_REREGISTER_QUARANTINE_HOURS } =
  await import('./tenant-service');

const HOUR_MS = 60 * 60 * 1000;

describe('TenantService.reclaimAbandonedTenants', () => {
  beforeEach(() => mocks.queryAll.mockReset());

  it('marks (not deletes) only inactive, unpaid, past-grace tenants and returns the freed usernames', async () => {
    mocks.queryAll.mockResolvedValueOnce([{ username: 'demo' }, { username: 'test' }]);

    const reclaimed = await TenantService.reclaimAbandonedTenants(7);

    expect(reclaimed).toEqual(['demo', 'test']);
    const [sql, params] = mocks.queryAll.mock.calls[0];
    // Soft delete: it must UPDATE to 'abandoned', never DELETE the row (a deleted row can't be
    // revived by an in-flight payment).
    expect(sql).toMatch(/UPDATE tenants/i);
    expect(sql).not.toMatch(/DELETE/i);
    expect(sql).toMatch(/SET subscription_status = 'abandoned'/);
    expect(sql).toMatch(/subscription_status = 'inactive'/); // still only targets inactive rows
    expect(sql).toMatch(/created_at < NOW\(\) - \(\$1 \* INTERVAL '1 day'\)/);
    expect(sql).toMatch(/NOT IN \(\s*SELECT tenant_id FROM payments/i);
    // Only real/in-flight payments pin a name; a 'failed'/'refunded' row must not protect it.
    expect(sql).toMatch(/status NOT IN \('failed', 'refunded'\)/);
    expect(params).toEqual([7]);
  });

  it('returns an empty array when nothing is abandoned', async () => {
    mocks.queryAll.mockResolvedValueOnce([]);
    await expect(TenantService.reclaimAbandonedTenants(7)).resolves.toEqual([]);
  });
});

describe('TenantService.create (revives abandoned reservations)', () => {
  beforeEach(() => {
    mocks.queryOne.mockReset();
    mocks.queryAll.mockReset();
  });

  it('upserts with a DO UPDATE that reclaims abandoned (quarantined) OR refreshes same-owner inactive', async () => {
    mocks.queryOne.mockResolvedValueOnce({
      id: '1',
      username: 'demo',
      owner: 'demo',
      subscription_status: 'inactive',
      subscription_plan: 'standard',
      config: {},
    });

    await TenantService.create('demo', 'demo', undefined);

    // A personal blog with no overrides makes no other queryOne calls, so the upsert is call 0.
    const [sql, params] = mocks.queryOne.mock.calls[mocks.queryOne.mock.calls.length - 1];
    expect(sql).toMatch(/INSERT INTO tenants/i);
    expect(sql).toMatch(/ON CONFLICT \(username\) DO UPDATE/i);
    // Abandoned branch: reclaimable only past the re-registration quarantine.
    expect(sql).toMatch(/subscription_status = 'abandoned'/);
    expect(sql).toMatch(/tenants\.updated_at < NOW\(\) - \(\$4 \* INTERVAL '1 hour'\)/);
    // Reclaim is additionally gated on a fresh payment-listener caught-up watermark, so a stalled
    // or backlogged listener (whose pending payments may be unprocessed) can't have its name reused.
    expect(sql).toMatch(/payment_listener\.caught_up/);
    // Resume branch: an existing same-owner inactive reservation refreshes its grace clock so an
    // active checkout is not swept mid-payment.
    expect(sql).toMatch(/tenants\.subscription_status = 'inactive' AND tenants\.owner = EXCLUDED\.owner/);
    // The grace clock refreshes only for a composed submission or a reclaim: an
    // overrides-less POST must not be able to pin a name inactive forever, out
    // of the abandoned sweep's reach.
    expect(sql).toMatch(/created_at = CASE WHEN tenants\.subscription_status = 'abandoned' OR \$5/);
    // The owner is only overwritten for the abandoned (reclaim) branch. The CONFIG takes the
    // new submission when the caller actually composed one ($5, the customize step) and also
    // on reclaim; an overrides-less create keeps a saved reservation intact instead of wiping
    // it back to defaults.
    expect(sql).toMatch(/owner = CASE WHEN tenants\.subscription_status = 'abandoned'/);
    expect(sql).toMatch(/config = CASE WHEN tenants\.subscription_status = 'abandoned' OR \$5/);
    expect(params[3]).toBe(ABANDONED_REREGISTER_QUARANTINE_HOURS);
    // This call passed no overrides, so the refresh flag must be false.
    expect(params[4]).toBe(false);
  });

  it('throws a conflict when the upsert returns no row (a live or other-owner tenant holds the name)', async () => {
    mocks.queryOne.mockResolvedValueOnce(null); // DO UPDATE WHERE matched nothing

    await expect(TenantService.create('demo', 'demo', undefined)).rejects.toMatchObject({
      isConflict: true,
    });
  });
});

describe('isReregisterableAbandoned (re-registration quarantine)', () => {
  const mk = (status: string, updatedAt: Date) => ({ subscriptionStatus: status, updatedAt } as any);

  it('is false for any non-abandoned status', () => {
    const old = new Date(Date.now() - 100 * HOUR_MS);
    for (const s of ['inactive', 'active', 'expired', 'suspended']) {
      expect(isReregisterableAbandoned(mk(s, old))).toBe(false);
    }
  });

  it('is false for a freshly-reclaimed row still inside the quarantine window', () => {
    const justNow = new Date(Date.now() - (ABANDONED_REREGISTER_QUARANTINE_HOURS / 2) * HOUR_MS);
    expect(isReregisterableAbandoned(mk('abandoned', justNow))).toBe(false);
  });

  it('is true once an abandoned row has cleared the quarantine window', () => {
    const past = new Date(Date.now() - (ABANDONED_REREGISTER_QUARANTINE_HOURS + 1) * HOUR_MS);
    expect(isReregisterableAbandoned(mk('abandoned', past))).toBe(true);
  });
});

describe('TenantService.isListenerCaughtUp', () => {
  beforeEach(() => mocks.queryOne.mockReset());

  it('reads the caught_up watermark freshness and returns true only when fresh', async () => {
    mocks.queryOne.mockResolvedValueOnce({ fresh: true });
    await expect(TenantService.isListenerCaughtUp()).resolves.toBe(true);
    const [sql] = mocks.queryOne.mock.calls[0];
    expect(sql).toMatch(/system_config WHERE key = 'payment_listener\.caught_up'/);
    expect(sql).toMatch(/updated_at > NOW\(\) - INTERVAL/);
  });

  it('fails safe to false when the watermark is missing or stale', async () => {
    mocks.queryOne.mockResolvedValueOnce(null);
    await expect(TenantService.isListenerCaughtUp()).resolves.toBe(false);
    mocks.queryOne.mockResolvedValueOnce({ fresh: false });
    await expect(TenantService.isListenerCaughtUp()).resolves.toBe(false);
  });
});

describe('TenantService.getByOwner', () => {
  beforeEach(() => mocks.queryAll.mockReset());

  it('excludes abandoned rows so reclaimed reservations do not show in the owner listing', async () => {
    mocks.queryAll.mockResolvedValueOnce([]);
    await TenantService.getByOwner('alice');
    const [sql] = mocks.queryAll.mock.calls[0];
    expect(sql).toMatch(/subscription_status != 'abandoned'/);
  });
});

describe('TenantService.create config-refresh flag', () => {
  beforeEach(() => mocks.queryOne.mockReset());

  const row = {
    id: '1',
    username: 'demo',
    owner: 'demo',
    subscription_status: 'inactive',
    subscription_plan: 'standard',
    config: {},
  };

  it('structural keys alone do not refresh a saved reservation', async () => {
    mocks.queryOne.mockResolvedValueOnce(row);
    await TenantService.create('demo', 'demo', { theme: 'system' });
    const [, params] = mocks.queryOne.mock.calls[mocks.queryOne.mock.calls.length - 1];
    expect(params[4]).toBe(false);
  });

  it('a composed field refreshes it', async () => {
    mocks.queryOne.mockResolvedValueOnce(row);
    await TenantService.create('demo', 'demo', { theme: 'system', styleTemplate: 'magazine' });
    const [, params] = mocks.queryOne.mock.calls[mocks.queryOne.mock.calls.length - 1];
    expect(params[4]).toBe(true);
  });
});

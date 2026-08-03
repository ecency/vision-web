import { beforeEach, describe, expect, it, vi } from 'vitest';

// The hourly maintenance pass is where the unverified-domain release has to run. A sweep that
// exists but is never called does nothing at all, which is the state the verification-cleanup
// helpers in domain-service sat in until they were deleted: written, tested by nobody, wired to
// nothing.

const mocks = vi.hoisted(() => ({
  callRPC: vi.fn(),
  expireSubscriptions: vi.fn(),
  reclaimAbandonedTenants: vi.fn(),
  releaseUnverifiedDomains: vi.fn(),
}));

vi.mock('@ecency/sdk/hive', () => ({
  callRPC: mocks.callRPC,
  config: { nodes: [] },
  setNodes: vi.fn(),
}));

vi.mock('./db/client', () => ({
  db: { query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(), transaction: vi.fn() },
}));

vi.mock('./services/tenant-service', () => ({
  COMMUNITY_NAME: /^hive-\d+$/,
  TenantService: {
    expireSubscriptions: mocks.expireSubscriptions,
    reclaimAbandonedTenants: mocks.reclaimAbandonedTenants,
    releaseUnverifiedDomains: mocks.releaseUnverifiedDomains,
  },
}));

vi.mock('./services/config-service', () => ({ ConfigService: { publishConfigFile: vi.fn() } }));
vi.mock('./services/audit-service', () => ({ AuditService: { log: vi.fn() } }));

const { PaymentListener, DEFAULT_UNVERIFIED_DOMAIN_CLAIM_DAYS } = await import('./payment-listener');

function maintenancePass() {
  const listener = new PaymentListener();
  return (listener as any).checkExpirations();
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.expireSubscriptions.mockResolvedValue(0);
  mocks.reclaimAbandonedTenants.mockResolvedValue([]);
  mocks.releaseUnverifiedDomains.mockResolvedValue([]);
  // Head block far ahead of the listener, so the caught-up gate is closed.
  mocks.callRPC.mockResolvedValue({ head_block_number: 999_999 });
});

describe('the maintenance pass releases unverified domain claims', () => {
  it('runs the release with the configured claim window', async () => {
    await maintenancePass();

    expect(mocks.releaseUnverifiedDomains).toHaveBeenCalledWith(
      DEFAULT_UNVERIFIED_DOMAIN_CLAIM_DAYS
    );
  });

  it('releases even while block replay is behind head', async () => {
    // Unlike the abandoned-tenant reclaim, nothing on chain grants a domain, so there is no
    // pending payment a backlog could be hiding.
    await maintenancePass();

    expect(mocks.reclaimAbandonedTenants).not.toHaveBeenCalled();
    expect(mocks.releaseUnverifiedDomains).toHaveBeenCalled();
  });

  it('names the domain it freed in the maintenance log', async () => {
    // The only reason this line exists is being able to tell WHICH domain was freed. Reporting
    // the post-update row (what UPDATE ... RETURNING hands back) prints null for every release,
    // which is indistinguishable from a sweep that released nothing.
    mocks.releaseUnverifiedDomains.mockResolvedValue([
      { username: 'alice', domain: 'mine.example.test' },
    ]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      await maintenancePass();

      const lines = log.mock.calls
        .map((args) => args.join(' '))
        .filter((line) => line.includes('Released unverified domain claim'));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('mine.example.test');
      expect(lines[0]).toContain('alice');
    } finally {
      log.mockRestore();
    }
  });

  it('expires subscriptions first, so a failure to release cannot skip that', async () => {
    mocks.releaseUnverifiedDomains.mockRejectedValue(new Error('database unavailable'));

    await expect(maintenancePass()).resolves.toBeUndefined();

    expect(mocks.expireSubscriptions).toHaveBeenCalled();
  });
});

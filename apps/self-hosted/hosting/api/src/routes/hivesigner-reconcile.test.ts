import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  reconcile: vi.fn(),
  auditLog: vi.fn(),
}));

const INTERNAL_SECRET = 'test-internal-secret-of-32-chars!!';

vi.mock('../db/client', () => ({ db: { transaction: vi.fn(), queryOne: vi.fn() } }));

vi.mock('../services/hivesigner-registry', () => ({
  reconcileHivesignerClientIds: mocks.reconcile,
}));

vi.mock('../services/tenant-service', () => ({
  TenantService: {},
  ABANDONED_REREGISTER_QUARANTINE_HOURS: 24,
  CAUGHT_UP_SQL: 'TRUE',
  DomainInUseError: class extends Error {},
}));

vi.mock('../services/config-service', () => ({ ConfigService: {} }));
vi.mock('../services/domain-service', () => ({ DomainService: {} }));
vi.mock('../utils/cors-domains', () => ({ addVerifiedDomainOrigin: vi.fn() }));

vi.mock('../services/audit-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/audit-service')>()),
  AuditService: { log: (...args: any[]) => mocks.auditLog(...args) },
}));

const { internalRoutes } = await import('./internal');

const RESULT = {
  account: 'ecency.app',
  registered: 26,
  enabled: ['alice'],
  disabled: [],
  unchanged: 24,
  failed: [],
};

function reconcile(headers: Record<string, string> = {}, body?: string) {
  return internalRoutes.request('/hivesigner/reconcile', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('POST /v1/internal/hivesigner/reconcile', () => {
  beforeEach(() => {
    process.env.HOSTING_INTERNAL_SECRET = INTERNAL_SECRET;
    mocks.reconcile.mockReset().mockResolvedValue(RESULT);
    mocks.auditLog.mockReset();
  });

  it('reconciles and reports what it changed', async () => {
    const response = await reconcile({ 'x-internal-secret': INTERNAL_SECRET });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(RESULT);
    expect(mocks.reconcile).toHaveBeenCalledTimes(1);
  });

  it('refuses a caller with no secret', async () => {
    const response = await reconcile();

    expect(response.status).toBe(403);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it('refuses a caller with the wrong secret', async () => {
    const response = await reconcile({ 'x-internal-secret': 'x'.repeat(INTERNAL_SECRET.length) });

    expect(response.status).toBe(403);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it('refuses every caller while the shared secret is unset', async () => {
    delete process.env.HOSTING_INTERNAL_SECRET;

    const response = await reconcile({ 'x-internal-secret': INTERNAL_SECRET });

    expect(response.status).toBe(403);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it('reads NOTHING the caller sends, so the secret cannot enable a chosen instance', async () => {
    // What gets a client id is decided from the chain and from each tenant's own
    // row. If the body were read, holding the shared secret would be enough to put
    // a login button on an instance whose URI was never registered.
    await reconcile(
      { 'x-internal-secret': INTERNAL_SECRET },
      JSON.stringify({ usernames: ['mallory'], clientId: 'attacker.app', force: true })
    );

    expect(mocks.reconcile).toHaveBeenCalledWith();
  });

  it('still answers when the caller sends a body that is not JSON at all', async () => {
    const response = await reconcile({ 'x-internal-secret': INTERNAL_SECRET }, 'not json');

    expect(response.status).toBe(200);
  });

  it('reports a transient failure when the chain cannot be read', async () => {
    // The scheduled job retries on its next tick; nothing was written.
    mocks.reconcile.mockRejectedValueOnce(new Error('ECONNRESET'));

    const response = await reconcile({ 'x-internal-secret': INTERNAL_SECRET });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'reconcile_failed' });
  });

  it('records the outcome, since nothing else can say why a client id changed', async () => {
    await reconcile({ 'x-internal-secret': INTERNAL_SECRET });

    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'hivesigner.client_ids_reconciled',
        eventData: expect.objectContaining({ enabled: ['alice'], registered: 26 }),
      })
    );
  });
});

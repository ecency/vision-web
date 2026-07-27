import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  getByUsername: vi.fn(),
  generateConfigFile: vi.fn(),
  auditLog: vi.fn(),
  buildConfig: vi.fn(),
  getBlogUrl: vi.fn(),
}));

vi.mock('../db/client', () => ({
  db: { transaction: mocks.transaction },
}));

vi.mock('../services/tenant-service', () => ({
  TenantService: {
    getByUsername: mocks.getByUsername,
    buildConfig: mocks.buildConfig,
    getBlogUrl: mocks.getBlogUrl,
  },
  ABANDONED_REREGISTER_QUARANTINE_HOURS: 24,
  CAUGHT_UP_SQL: 'TRUE',
}));

vi.mock('../services/config-service', () => ({
  ConfigService: {
    generateConfigFile: mocks.generateConfigFile,
  },
}));

vi.mock('../services/audit-service', () => ({
  AuditService: { log: (...args: any[]) => mocks.auditLog(...args) },
  parseClientIp: (xff: string | undefined) => xff?.split(',').pop()?.trim() ?? null,
}));

const { internalRoutes } = await import('./internal');

describe('POST /activate config publication', () => {
  beforeEach(() => {
    process.env.HOSTING_INTERNAL_SECRET = 'test-secret';
    mocks.transaction.mockReset().mockResolvedValue({
      status: 200,
      tenantId: 'tenant-1',
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      plan: 'standard',
    });
    mocks.getByUsername.mockReset().mockResolvedValue({
      username: 'alice',
      subscriptionStatus: 'active',
    });
    mocks.generateConfigFile.mockReset().mockResolvedValue('/configs/alice.json');
    mocks.auditLog.mockReset();
  });

  const activate = () =>
    internalRoutes.request('/activate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': 'test-secret',
      },
      body: JSON.stringify({
        username: 'alice',
        payer: 'alice',
        months: 1,
        order_id: 'order-1',
        amount_usd: 2,
      }),
    });

  it('returns a retryable server error when the served config cannot be published', async () => {
    mocks.generateConfigFile.mockRejectedValueOnce(new Error('disk unavailable'));

    const response = await activate();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'activation_failed' });
  });

  it('returns a retryable server error when a new activation tenant is missing or inactive', async () => {
    mocks.getByUsername.mockResolvedValueOnce(null);

    const missingResponse = await activate();

    expect(missingResponse.status).toBe(500);
    expect(await missingResponse.json()).toEqual({ error: 'activation_failed' });

    mocks.getByUsername.mockResolvedValueOnce({
      username: 'alice',
      subscriptionStatus: 'inactive',
    });

    const inactiveResponse = await activate();

    expect(inactiveResponse.status).toBe(500);
    expect(await inactiveResponse.json()).toEqual({ error: 'activation_failed' });
  });

  it('acknowledges an expired duplicate without extending or republishing it', async () => {
    mocks.transaction.mockResolvedValueOnce({
      status: 200,
      duplicate: true,
      plan: 'standard',
    });
    mocks.getByUsername.mockResolvedValueOnce({
      username: 'alice',
      subscriptionStatus: 'expired',
    });

    const response = await activate();

    expect(response.status).toBe(200);
    expect(mocks.generateConfigFile).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ activated: true, duplicate: true });
  });

  it('retries config publication for an active duplicate', async () => {
    mocks.transaction.mockResolvedValueOnce({
      status: 200,
      duplicate: true,
      plan: 'standard',
    });

    const response = await activate();

    expect(response.status).toBe(200);
    expect(mocks.generateConfigFile).toHaveBeenCalledTimes(1);
  });

  it('acknowledges activation only after config publication succeeds', async () => {
    const response = await activate();

    expect(response.status).toBe(200);
    expect(mocks.generateConfigFile).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({ activated: true, plan: 'standard' });
  });
});

describe('internal endpoint audit trail', () => {
  beforeEach(() => {
    process.env.HOSTING_INTERNAL_SECRET = 'test-secret';
    mocks.transaction.mockReset().mockResolvedValue({
      status: 200,
      tenantId: 'tenant-1',
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      plan: 'standard',
    });
    mocks.getByUsername.mockReset().mockResolvedValue({
      id: 'tenant-1',
      username: 'alice',
      subscriptionStatus: 'active',
    });
    mocks.generateConfigFile.mockReset().mockResolvedValue('/configs/alice.json');
    mocks.buildConfig.mockReset().mockResolvedValue({ version: 1 });
    mocks.getBlogUrl.mockReset().mockReturnValue('https://alice.blogs.ecency.com');
    mocks.auditLog.mockReset();
  });

  const post = (path: string, body: Record<string, unknown>) =>
    internalRoutes.request(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': 'test-secret',
        'x-forwarded-for': '203.0.113.9, 10.0.0.2',
        'user-agent': 'epoints-fulfillment/1.0',
      },
      body: JSON.stringify(body),
    });

  const activateBody = {
    username: 'alice',
    payer: 'alice',
    months: 12,
    order_id: 'order-1',
    amount_usd: 24,
  };

  it('records a card activation with its order, term and rail', async () => {
    const response = await post('/activate', activateBody);

    expect(response.status).toBe(200);
    expect(mocks.auditLog).toHaveBeenCalledTimes(1);
    expect(mocks.auditLog.mock.calls[0][0]).toMatchObject({
      tenantId: 'tenant-1',
      eventType: 'tenant.activated',
      eventData: {
        username: 'alice',
        payer: 'alice',
        orderId: 'order-1',
        months: 12,
        amountUsd: 24,
        plan: 'standard',
        duplicate: false,
        rail: 'card',
      },
      ipAddress: '10.0.0.2',
      userAgent: 'epoints-fulfillment/1.0',
    });
  });

  it('does not record an activation that failed to publish', async () => {
    mocks.generateConfigFile.mockRejectedValueOnce(new Error('disk unavailable'));

    const response = await post('/activate', activateBody);

    expect(response.status).toBe(500);
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });

  it.each([
    [403, 'payer_not_owner'],
    [409, 'order_tenant_mismatch'],
  ])('records a %i activation denial with its reason', async (status, reason) => {
    mocks.transaction.mockResolvedValueOnce({ status, tenantId: 'tenant-1' });

    const response = await post('/activate', activateBody);

    expect(response.status).toBe(status);
    expect(mocks.auditLog).toHaveBeenCalledTimes(1);
    expect(mocks.auditLog.mock.calls[0][0]).toMatchObject({
      tenantId: 'tenant-1',
      eventType: 'tenant.activation_denied',
      eventData: { username: 'alice', orderId: 'order-1', reason },
    });
  });

  it('records a denial for an activation against a tenant that no longer exists', async () => {
    mocks.transaction.mockResolvedValueOnce({ status: 404 });

    const response = await post('/activate', activateBody);

    expect(response.status).toBe(404);
    expect(mocks.auditLog.mock.calls[0][0]).toMatchObject({
      tenantId: null,
      eventType: 'tenant.activation_denied',
      eventData: { reason: 'tenant_not_found' },
    });
  });

  it('records a Pro free-blog claim, flagging whether it provisioned the blog', async () => {
    const row = {
      id: 'tenant-9',
      username: 'alice',
      owner: 'alice',
      subscription_status: 'active',
      subscription_plan: 'standard',
      subscription_started_at: null,
      subscription_expires_at: null,
      custom_domain: null,
      custom_domain_verified: false,
      custom_domain_verified_at: null,
      config: {},
      created_at: '2026-07-27T10:25:13.000Z',
      updated_at: '2026-07-27T10:25:13.000Z',
    };
    mocks.transaction.mockResolvedValueOnce({ created: true, row });

    const created = await post('/claim-blog', { username: 'alice' });

    expect(created.status).toBe(200);
    expect(mocks.auditLog.mock.calls[0][0]).toMatchObject({
      tenantId: 'tenant-9',
      eventType: 'tenant.pro_blog_claimed',
      eventData: { username: 'alice', created: true, subscriptionStatus: 'active' },
    });

    mocks.auditLog.mockReset();
    mocks.transaction.mockResolvedValueOnce({ created: false, row });

    const existing = await post('/claim-blog', { username: 'alice' });

    expect(existing.status).toBe(200);
    expect(mocks.auditLog.mock.calls[0][0]).toMatchObject({
      eventType: 'tenant.pro_blog_claimed',
      eventData: { created: false },
    });
  });
});

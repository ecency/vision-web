import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  getByUsername: vi.fn(),
  generateConfigFile: vi.fn(),
  auditLog: vi.fn(),
  buildConfig: vi.fn(),
  getBlogUrl: vi.fn(),
  getByDomain: vi.fn(),
  setCustomDomain: vi.fn(),
  verifyCustomDomain: vi.fn(),
  createVerification: vi.fn(),
  verifyDomain: vi.fn(),
  markVerified: vi.fn(),
  addVerifiedDomainOrigin: vi.fn(),
}));

// Must satisfy MIN_INTERNAL_SECRET_LENGTH, which the routes now enforce.
const INTERNAL_SECRET = 'test-internal-secret-of-32-chars!!';

vi.mock('../db/client', () => ({
  db: { transaction: mocks.transaction },
}));

vi.mock('../services/tenant-service', () => ({
  TenantService: {
    getByUsername: mocks.getByUsername,
    buildConfig: mocks.buildConfig,
    getBlogUrl: mocks.getBlogUrl,
    getByDomain: mocks.getByDomain,
    setCustomDomain: mocks.setCustomDomain,
    verifyCustomDomain: mocks.verifyCustomDomain,
  },
  ABANDONED_REREGISTER_QUARANTINE_HOURS: 24,
  CAUGHT_UP_SQL: 'TRUE',
}));

vi.mock('../services/config-service', () => ({
  ConfigService: {
    generateConfigFile: mocks.generateConfigFile,
  },
}));

vi.mock('../services/domain-service', () => ({
  DomainService: {
    createVerification: mocks.createVerification,
    verifyDomain: mocks.verifyDomain,
    markVerified: mocks.markVerified,
  },
}));

vi.mock('../utils/cors-domains', () => ({
  addVerifiedDomainOrigin: mocks.addVerifiedDomainOrigin,
}));

// Only the write path is mocked: parseClientIp stays real so the tests keep asserting the
// production forwarded-for rule rather than a copy of it that can silently drift.
vi.mock('../services/audit-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/audit-service')>()),
  AuditService: { log: (...args: any[]) => mocks.auditLog(...args) },
}));

const { internalRoutes } = await import('./internal');

describe('POST /activate config publication', () => {
  beforeEach(() => {
    process.env.HOSTING_INTERNAL_SECRET = INTERNAL_SECRET;
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
        'x-internal-secret': INTERNAL_SECRET,
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
    process.env.HOSTING_INTERNAL_SECRET = INTERNAL_SECRET;
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
    mocks.getByDomain.mockReset().mockResolvedValue(null);
    mocks.setCustomDomain.mockReset().mockResolvedValue(undefined);
    mocks.verifyCustomDomain.mockReset().mockResolvedValue(undefined);
    mocks.createVerification.mockReset().mockResolvedValue({ verificationMethod: 'cname' });
    mocks.verifyDomain.mockReset().mockResolvedValue(true);
    mocks.markVerified.mockReset().mockResolvedValue(undefined);
    mocks.addVerifiedDomainOrigin.mockReset();
    mocks.auditLog.mockReset();
  });

  const post = (path: string, body: Record<string, unknown>) =>
    internalRoutes.request(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': INTERNAL_SECRET,
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
        publication: 'published',
        rail: 'card',
      },
      ipAddress: '10.0.0.2',
      userAgent: 'epoints-fulfillment/1.0',
    });
  });

  it('records a committed activation whose config failed to publish', async () => {
    mocks.generateConfigFile.mockRejectedValueOnce(new Error('disk unavailable'));

    const response = await post('/activate', activateBody);

    // The transaction has committed - the tenant is active and the order is recorded - so the
    // event must exist even though the caller gets a retryable 500 and may never come back.
    expect(response.status).toBe(500);
    expect(mocks.auditLog).toHaveBeenCalledTimes(1);
    expect(mocks.auditLog.mock.calls[0][0]).toMatchObject({
      tenantId: 'tenant-1',
      eventType: 'tenant.activated',
      eventData: { orderId: 'order-1', publication: 'failed', publishError: 'disk unavailable' },
    });
  });

  it('records a committed activation whose tenant could not be reloaded', async () => {
    mocks.getByUsername.mockResolvedValueOnce(null);

    const response = await post('/activate', activateBody);

    expect(response.status).toBe(500);
    expect(mocks.auditLog.mock.calls[0][0]).toMatchObject({
      tenantId: 'tenant-1',
      eventType: 'tenant.activated',
      eventData: { publication: 'failed', tenantStatus: null },
    });
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

  it('carries the tenant status so a replay that reactivated nothing is not read as an activation', async () => {
    mocks.transaction.mockResolvedValueOnce({
      status: 200,
      tenantId: 'tenant-1',
      duplicate: true,
      plan: 'standard',
    });
    mocks.getByUsername.mockResolvedValueOnce({
      id: 'tenant-1',
      username: 'alice',
      subscriptionStatus: 'expired',
    });

    const response = await post('/activate', activateBody);

    expect(response.status).toBe(200);
    expect(mocks.generateConfigFile).not.toHaveBeenCalled();
    // Publication was deliberately not attempted, which is a third outcome: recording it as
    // published would claim a blog is being served when nothing was written.
    expect(mocks.auditLog.mock.calls[0][0].eventData).toMatchObject({
      duplicate: true,
      publication: 'skipped',
      tenantStatus: 'expired',
    });
  });

  it('records an internally attached custom domain', async () => {
    mocks.getByUsername.mockResolvedValueOnce({
      id: 'tenant-1',
      username: 'alice',
      subscriptionPlan: 'pro',
    });

    const response = await post('/domain', { username: 'alice', domain: 'blog.example.com' });

    expect(response.status).toBe(200);
    expect(mocks.auditLog.mock.calls[0][0]).toMatchObject({
      tenantId: 'tenant-1',
      eventType: 'domain.added',
      eventData: { domain: 'blog.example.com', username: 'alice', via: 'internal' },
    });

    // setCustomDomain has committed (and cleared the verified flag) before the verification record
    // is created, so a failure there must not cost the event describing that change.
    mocks.auditLog.mockReset();
    mocks.getByUsername.mockResolvedValueOnce({
      id: 'tenant-1',
      username: 'alice',
      subscriptionPlan: 'pro',
    });
    mocks.createVerification.mockRejectedValueOnce(new Error('verification insert failed'));

    await Promise.resolve(
      post('/domain', { username: 'alice', domain: 'blog.example.com' })
    ).catch(() => undefined);

    expect(mocks.auditLog).toHaveBeenCalledTimes(1);
    expect(mocks.auditLog.mock.calls[0][0]).toMatchObject({ eventType: 'domain.added' });
  });

  it('records a domain verification before the bookkeeping that could strand it', async () => {
    mocks.getByUsername.mockResolvedValue({
      id: 'tenant-1',
      username: 'alice',
      customDomain: 'blog.example.com',
      customDomainVerified: false,
    });

    const response = await post('/domain/verify', { username: 'alice' });

    expect(response.status).toBe(200);
    expect(mocks.auditLog.mock.calls[0][0]).toMatchObject({
      tenantId: 'tenant-1',
      eventType: 'domain.verified',
      eventData: { domain: 'blog.example.com', username: 'alice', via: 'internal' },
    });

    // The tenant is verified the moment verifyCustomDomain commits, and the already-verified early
    // return means a retry never reaches an audit call placed later. So a failure in the trailing
    // bookkeeping must not cost the event.
    mocks.auditLog.mockReset();
    mocks.markVerified.mockRejectedValueOnce(new Error('bookkeeping write failed'));

    await Promise.resolve(post('/domain/verify', { username: 'alice' })).catch(() => undefined);

    expect(mocks.auditLog).toHaveBeenCalledTimes(1);
    expect(mocks.auditLog.mock.calls[0][0]).toMatchObject({ eventType: 'domain.verified' });
  });

  it('does not record a domain verification that DNS rejected', async () => {
    mocks.getByUsername.mockResolvedValueOnce({
      id: 'tenant-1',
      username: 'alice',
      customDomain: 'blog.example.com',
      customDomainVerified: false,
    });
    mocks.verifyDomain.mockResolvedValueOnce(false);

    const response = await post('/domain/verify', { username: 'alice' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ verified: false });
    expect(mocks.auditLog).not.toHaveBeenCalled();
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

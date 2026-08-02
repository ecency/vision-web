import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getByUsername: vi.fn(),
  isDomainClaimed: vi.fn(),
  setCustomDomain: vi.fn(),
  verifyCustomDomain: vi.fn(),
  removeCustomDomain: vi.fn(),
  getByDomain: vi.fn(),
  createVerification: vi.fn(),
  verifyDomain: vi.fn(),
  markVerified: vi.fn(),
}));

class DomainInUseError extends Error {}

vi.mock('../services/tenant-service', () => ({
  TenantService: {
    getByUsername: mocks.getByUsername,
    isDomainClaimed: mocks.isDomainClaimed,
    setCustomDomain: mocks.setCustomDomain,
    verifyCustomDomain: mocks.verifyCustomDomain,
    removeCustomDomain: mocks.removeCustomDomain,
    getByDomain: mocks.getByDomain,
  },
  DomainInUseError,
}));

vi.mock('../services/domain-service', () => ({
  DomainService: {
    createVerification: mocks.createVerification,
    verifyDomain: mocks.verifyDomain,
    markVerified: mocks.markVerified,
  },
}));

vi.mock('../middleware/auth', () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set('user', { username: 'alice' });
    await next();
  },
}));

vi.mock('../services/audit-service', () => ({
  AuditService: { log: vi.fn() },
  parseClientIp: () => null,
}));

vi.mock('../utils/cors-domains', () => ({ addVerifiedDomainOrigin: vi.fn() }));

const { domainRoutes } = await import('./domains');
const { PRO_GRACE_DAYS } = await import('../services/subscription');

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function tenant(over: Record<string, unknown> = {}) {
  return {
    id: 'tenant-1',
    username: 'alice',
    owner: 'alice',
    subscriptionPlan: 'pro',
    subscriptionStatus: 'active',
    subscriptionExpiresAt: new Date(Date.now() + 86_400_000),
    customDomain: null,
    customDomainVerified: false,
    ...over,
  };
}

function addDomain() {
  return domainRoutes.request('http://localhost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain: 'mine.example.test' }),
  });
}

function verifyDomain() {
  return domainRoutes.request('http://localhost/verify', { method: 'POST' });
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.isDomainClaimed.mockResolvedValue(false);
  mocks.createVerification.mockResolvedValue({
    verificationMethod: 'cname',
    expiresAt: new Date().toISOString(),
  });
  mocks.setCustomDomain.mockImplementation(async () =>
    tenant({ customDomain: 'mine.example.test', customDomainVerified: false })
  );
  mocks.verifyDomain.mockResolvedValue(true);
  mocks.verifyCustomDomain.mockImplementation(async () =>
    tenant({ customDomain: 'mine.example.test', customDomainVerified: true })
  );
  mocks.markVerified.mockResolvedValue(undefined);
  mocks.removeCustomDomain.mockResolvedValue(undefined);
});

/**
 * Expiry flips the status and leaves subscription_plan on 'pro' forever, so gates that read the
 * plan alone kept a lapsed customer's custom-domain capabilities: they could attach a new domain
 * (occupying it against the global UNIQUE constraint) and verify it (making it a first-party CORS
 * origin). Attach and verify now read standing; delete never does.
 */
describe('custom domain capabilities follow subscription standing', () => {
  it('lets an active Pro tenant attach and verify', async () => {
    mocks.getByUsername.mockResolvedValue(tenant());
    expect((await addDomain()).status).toBe(201);

    mocks.getByUsername.mockResolvedValue(tenant({ customDomain: 'mine.example.test' }));
    expect((await verifyDomain()).status).toBe(200);
  });

  it('still lets a tenant inside the grace window attach and verify', async () => {
    // A renewal in progress must not be blocked; this is why the cutoff is a window and not
    // the expiry instant.
    mocks.getByUsername.mockResolvedValue(
      tenant({
        subscriptionStatus: 'expired',
        subscriptionExpiresAt: daysAgo(PRO_GRACE_DAYS - 1),
        customDomain: 'mine.example.test',
      })
    );

    expect((await addDomain()).status).toBe(201);
    expect((await verifyDomain()).status).toBe(200);
  });

  it('refuses an attach once the grace window has passed', async () => {
    mocks.getByUsername.mockResolvedValue(
      tenant({
        subscriptionStatus: 'expired',
        subscriptionExpiresAt: daysAgo(PRO_GRACE_DAYS + 1),
      })
    );

    const response = await addDomain();

    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ customDomainCapability: 'lapsed' });
    expect(mocks.setCustomDomain).not.toHaveBeenCalled();
  });

  it('refuses a verification once the grace window has passed', async () => {
    // Verification is what puts a domain into the served set and the CORS allowlist, so it is
    // gated as tightly as the attach.
    mocks.getByUsername.mockResolvedValue(
      tenant({
        subscriptionStatus: 'expired',
        subscriptionExpiresAt: daysAgo(PRO_GRACE_DAYS + 1),
        customDomain: 'mine.example.test',
      })
    );

    const response = await verifyDomain();

    expect(response.status).toBe(402);
    expect(mocks.verifyCustomDomain).not.toHaveBeenCalled();
  });

  it('refuses a suspended tenant outright', async () => {
    mocks.getByUsername.mockResolvedValue(
      tenant({ subscriptionStatus: 'suspended', subscriptionExpiresAt: daysAgo(1) })
    );

    expect((await addDomain()).status).toBe(402);
    expect((await verifyDomain()).status).toBe(402);
  });

  it('still refuses a standard-plan tenant with the plan message', async () => {
    mocks.getByUsername.mockResolvedValue(tenant({ subscriptionPlan: 'standard' }));

    const response = await addDomain();

    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ error: 'Custom domains require Pro plan' });
  });

  it('lets a lapsed tenant remove its domain', async () => {
    // Releasing a domain must never be gated: it is how an owner frees a name, and refusing it
    // would strand the domain exactly when the tenant is least entitled to hold it.
    mocks.getByUsername.mockResolvedValue(
      tenant({
        subscriptionStatus: 'expired',
        subscriptionExpiresAt: daysAgo(PRO_GRACE_DAYS + 30),
        customDomain: 'mine.example.test',
      })
    );

    const response = await domainRoutes.request('http://localhost/', { method: 'DELETE' });

    expect(response.status).toBe(200);
    expect(mocks.removeCustomDomain).toHaveBeenCalledWith('alice');
  });
});

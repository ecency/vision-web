import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getByUsername: vi.fn(),
  isDomainClaimed: vi.fn(),
  verifyCustomDomain: vi.fn(),
  removeCustomDomain: vi.fn(),
  getByDomain: vi.fn(),
  attachDomain: vi.fn(),
  verifyDomain: vi.fn(),
  markVerified: vi.fn(),
}));

class DomainInUseError extends Error {}

vi.mock('../services/tenant-service', () => ({
  TenantService: {
    getByUsername: mocks.getByUsername,
    isDomainClaimed: mocks.isDomainClaimed,
    verifyCustomDomain: mocks.verifyCustomDomain,
    removeCustomDomain: mocks.removeCustomDomain,
    getByDomain: mocks.getByDomain,
  },
  DomainInUseError,
}));

vi.mock('../services/domain-service', () => ({
  DomainService: {
    attachDomain: mocks.attachDomain,
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

const COMMUNITY = {
  id: 'tenant-community',
  username: 'hive-125125',
  owner: 'alice',
  subscriptionPlan: 'pro',
  // Attach and verify now require a subscription that is paid for, not just the Pro plan.
  subscriptionStatus: 'active',
  subscriptionExpiresAt: null as Date | null,
  customDomain: null as string | null,
};

function request(path: string, init?: RequestInit) {
  return domainRoutes.request(`http://localhost${path}`, init);
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.isDomainClaimed.mockResolvedValue(false);
  mocks.attachDomain.mockResolvedValue({
    tenant: { ...COMMUNITY, customDomainVerified: false },
    verification: { verificationMethod: 'cname', expiresAt: new Date().toISOString() },
  });
});

describe('custom domains for a community instance', () => {
  it('addresses the community tenant rather than the caller name', async () => {
    // A community tenant is username hive-NNNN with a separate owner, so
    // resolving by the caller's own name could only reach a personal blog.
    mocks.getByUsername.mockImplementation(async (name: string) =>
      name === 'hive-125125' ? { ...COMMUNITY } : null,
    );

    const res = await request('/?tenant=hive-125125', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: 'blog.example.com' }),
    });

    expect(res.status).toBe(201);
    expect(mocks.attachDomain).toHaveBeenCalledWith(
      'hive-125125',
      'blog.example.com',
    );
  });

  it('still refuses a tenant the caller does not own', async () => {
    mocks.getByUsername.mockResolvedValue({ ...COMMUNITY, owner: 'bob' });

    const res = await request('/?tenant=hive-125125', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: 'blog.example.com' }),
    });

    expect(res.status).toBe(403);
    expect(mocks.attachDomain).not.toHaveBeenCalled();
  });
});

describe('domain occupancy', () => {
  it('rejects a domain another tenant reserved but never verified', async () => {
    // getByDomain matches verified rows only, but the column is UNIQUE either
    // way, so an unverified reservation still blocks everyone else.
    mocks.getByUsername.mockResolvedValue({ ...COMMUNITY, username: 'alice' });
    mocks.isDomainClaimed.mockResolvedValue(true);

    const res = await request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: 'taken.example.com' }),
    });

    expect(res.status).toBe(409);
    expect(mocks.attachDomain).not.toHaveBeenCalled();
  });

  it('answers a lost race with a conflict rather than a server error', async () => {
    mocks.getByUsername.mockResolvedValue({ ...COMMUNITY, username: 'alice' });
    mocks.attachDomain.mockRejectedValue(new DomainInUseError('x'));

    const res = await request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: 'raced.example.com' }),
    });

    expect(res.status).toBe(409);
  });
});

describe('domain verification', () => {
  it('applies the result to the domain that was checked', async () => {
    mocks.getByUsername.mockResolvedValue({
      ...COMMUNITY,
      username: 'alice',
      customDomain: 'mine.example.com',
    });
    mocks.verifyDomain.mockResolvedValue(true);
    mocks.verifyCustomDomain.mockResolvedValue({ ...COMMUNITY });

    const res = await request('/verify', { method: 'POST' });

    expect(res.status).toBe(200);
    expect(mocks.verifyCustomDomain).toHaveBeenCalledWith(
      'alice',
      'mine.example.com',
    );
    expect(mocks.markVerified).toHaveBeenCalledWith('alice', 'mine.example.com');
  });

  it('does not report success when the domain changed mid-check', async () => {
    // The conditional update matched no row, so the DNS result describes a
    // domain the tenant no longer holds.
    mocks.getByUsername.mockResolvedValue({
      ...COMMUNITY,
      username: 'alice',
      customDomain: 'mine.example.com',
    });
    mocks.verifyDomain.mockResolvedValue(true);
    mocks.verifyCustomDomain.mockResolvedValue(null);

    const res = await request('/verify', { method: 'POST' });
    const body = (await res.json()) as { verified: boolean };

    expect(body.verified).toBe(false);
    expect(mocks.markVerified).not.toHaveBeenCalled();
  });
});

describe('removing a custom domain', () => {
  it('removes it from the community tenant, not the caller name', async () => {
    mocks.getByUsername.mockImplementation(async (name: string) =>
      name === 'hive-125125' ? { ...COMMUNITY } : null,
    );
    mocks.removeCustomDomain.mockResolvedValue(undefined);

    const res = await request('/?tenant=hive-125125', { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(mocks.removeCustomDomain).toHaveBeenCalledWith('hive-125125');
  });

  it('refuses to strip the domain off a tenant the caller does not own', async () => {
    // Destructive and newly reachable for other tenants, so the ownership check
    // is asserted rather than assumed.
    mocks.getByUsername.mockResolvedValue({ ...COMMUNITY, owner: 'bob' });

    const res = await request('/?tenant=hive-125125', { method: 'DELETE' });

    expect(res.status).toBe(403);
    expect(mocks.removeCustomDomain).not.toHaveBeenCalled();
  });

  it('reports a missing tenant rather than removing anything', async () => {
    mocks.getByUsername.mockResolvedValue(null);

    const res = await request('/?tenant=hive-999999', { method: 'DELETE' });

    expect(res.status).toBe(404);
    expect(mocks.removeCustomDomain).not.toHaveBeenCalled();
  });
});

describe('tenant targeting', () => {
  it('rejects a malformed tenant parameter before touching the database', async () => {
    const res = await request('/?tenant=NOT%20A%20NAME', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: 'blog.example.com' }),
    });

    expect(res.status).toBe(400);
    expect(mocks.getByUsername).not.toHaveBeenCalled();
  });

  it('defaults to the caller when no tenant is given', async () => {
    mocks.getByUsername.mockResolvedValue({ ...COMMUNITY, username: 'alice' });
    mocks.removeCustomDomain.mockResolvedValue(undefined);

    await request('/', { method: 'DELETE' });

    expect(mocks.getByUsername).toHaveBeenCalledWith('alice');
  });
});

describe('re-submitting a domain the tenant already holds', () => {
  it('does not re-issue verification, which would drop the live certificate', () =>
    (async () => {
      mocks.getByUsername.mockResolvedValue({
        ...COMMUNITY,
        username: 'alice',
        customDomain: 'mine.example.com',
        customDomainVerified: true,
      });
      // The attach preserves the flag only for an unchanged domain, and answers with no
      // verification when it found one, so a null verification means nothing was reset.
      mocks.attachDomain.mockResolvedValue({
        tenant: {
          ...COMMUNITY,
          customDomain: 'mine.example.com',
          customDomainVerified: true,
        },
        verification: null,
      });

      const res = await request('/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: 'mine.example.com' }),
      });

      expect(res.status).toBe(200);
      // Answered from the live domain rather than with fresh DNS instructions, which is what
      // tells the caller nothing was reset. That the attach itself leaves the record alone is
      // proved in domain-attach.test.ts.
      expect(await res.json()).toMatchObject({ domain: 'mine.example.com', verified: true });
    })());

  it('still issues verification for a domain that is new to the tenant', async () => {
    mocks.getByUsername.mockResolvedValue({
      ...COMMUNITY,
      username: 'alice',
      customDomain: 'old.example.com',
      customDomainVerified: true,
    });
    mocks.attachDomain.mockResolvedValue({
      tenant: {
        ...COMMUNITY,
        customDomain: 'new.example.com',
        customDomainVerified: false,
      },
      verification: { verificationMethod: 'cname', expiresAt: new Date().toISOString() },
    });

    const res = await request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: 'new.example.com' }),
    });

    expect(res.status).toBe(201);
    expect(mocks.attachDomain).toHaveBeenCalledWith('alice', 'new.example.com');
  });
});

describe('availability check', () => {
  it('reports a domain reserved but never verified as unavailable', async () => {
    // The verified-only lookup used to call this free, right up until the add
    // call refused it with a conflict.
    mocks.isDomainClaimed.mockResolvedValue(true);
    mocks.getByDomain.mockResolvedValue(null);

    const res = await request('/check/squat.example.com');
    const body = (await res.json()) as { available: boolean; registeredTo: string | null };

    expect(body.available).toBe(false);
    // Unproven claims do not name their holder to unauthenticated callers.
    expect(body.registeredTo).toBe(null);
  });

  it('reports a free domain as available', async () => {
    mocks.isDomainClaimed.mockResolvedValue(false);

    const res = await request('/check/free.example.com');
    const body = (await res.json()) as { available: boolean };

    expect(body.available).toBe(true);
  });
});

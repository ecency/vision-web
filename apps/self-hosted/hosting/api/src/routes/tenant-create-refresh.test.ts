import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  existing: null as any,
  created: [] as any[],
}));

vi.mock('../db/client', () => ({
  db: {
    // The audit logger chains .catch on these, so they must return promises.
    query: vi.fn(async () => ({ rows: [] })),
    queryOne: vi.fn(async () => null),
  },
}));
vi.mock('../middleware/auth', () => ({
  authMiddleware: async (_c: unknown, next: () => Promise<void>) => next(),
  adminMiddleware: async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock('../middleware/rate-limit', () => ({
  rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock('../middleware/payment-target-lock', () => ({
  withPaymentTargetLock: async (
    _c: unknown,
    next: () => Promise<void>,
  ) => next(),
}));
vi.mock('../services/tenant-service', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    isReregisterableAbandoned: () => false,
    TenantService: {
      ...actual.TenantService,
      getByUsername: async () => state.existing,
      isListenerCaughtUp: async () => true,
      verifyHiveAccount: async () => true,
      verifyCommunityControlledBy: async () => true,
      create: async (username: string, owner: string, config: any) => {
        state.created.push({ username, owner, config });
        return {
          username,
          owner,
          subscriptionStatus: 'inactive',
          subscriptionPlan: 'standard',
        };
      },
    },
  };
});

const { tenantRoutes } = await import('./tenants');

function post(body: unknown) {
  return tenantRoutes.request('http://localhost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /v1/tenants appearance validation', () => {
  beforeEach(() => {
    state.existing = null;
    state.created = [];
  });

  it('rejects an accent that is not a hex color', async () => {
    const res = await post({ username: 'alice', config: { accent: 'red' } });
    expect(res.status).toBe(400);
    expect(state.created).toHaveLength(0);
  });

  it('rejects an unknown font preset', async () => {
    const res = await post({ username: 'alice', config: { fontPreset: 'comic-sans' } });
    expect(res.status).toBe(400);
    expect(state.created).toHaveLength(0);
  });

  it('accepts valid appearance values', async () => {
    const res = await post({
      username: 'alice',
      config: { styleTemplate: 'magazine', accent: '#ff6600', fontPreset: 'classic' },
    });
    expect(res.status).toBe(201);
    expect(state.created[0].config.accent).toBe('#ff6600');
  });
});

/**
 * The customize step promises that the look on screen is the look that
 * activates: a same-owner unpaid reservation is refreshed by re-creation
 * (the latest submission wins), while anyone else's reservation and any
 * live tenant stay 409.
 */
describe('POST /v1/tenants refreshes a same-owner unpaid reservation', () => {
  beforeEach(() => {
    state.existing = null;
    state.created = [];
  });

  it('lets the owner re-submit an inactive reservation with a new look', async () => {
    state.existing = { username: 'alice', owner: 'alice', subscriptionStatus: 'inactive' };
    const res = await post({ username: 'alice', config: { styleTemplate: 'developer' } });
    expect(res.status).toBe(201);
    expect(state.created[0].config.styleTemplate).toBe('developer');
  });

  it("still refuses someone else's inactive reservation", async () => {
    state.existing = { username: 'alice', owner: 'mallory', subscriptionStatus: 'inactive' };
    const res = await post({ username: 'alice', config: { styleTemplate: 'developer' } });
    expect(res.status).toBe(409);
    expect(state.created).toHaveLength(0);
  });

  it('still refuses a live tenant', async () => {
    state.existing = { username: 'alice', owner: 'alice', subscriptionStatus: 'active' };
    const res = await post({ username: 'alice', config: {} });
    expect(res.status).toBe(409);
    expect(state.created).toHaveLength(0);
  });
});

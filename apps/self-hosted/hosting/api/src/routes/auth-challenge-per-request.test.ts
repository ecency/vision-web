import { beforeEach, describe, expect, it, vi } from 'vitest';

// A new login challenge must not replace another one still pending for the
// same account: each challenge is kept under its own key, so asking for one
// again (from another tab, or by anyone) never voids the one being signed.

const mocks = vi.hoisted(() => {
  const store = new Map<string, { challenge: string; expiresAt: number }>();
  return {
    store,
    challengeStore: {
      set: vi.fn(async (key: string, challenge: string, ttl: number) => {
        store.set(key.toLowerCase(), { challenge, expiresAt: Date.now() + ttl * 1000 });
      }),
      get: vi.fn(async (key: string) => store.get(key.toLowerCase()) ?? null),
      delete: vi.fn(async (key: string) => void store.delete(key.toLowerCase())),
    },
    callRPC: vi.fn(async () => [{ name: 'alice', posting: { key_auths: [], weight_threshold: 1 } }]),
  };
});

vi.mock('../utils/redis', () => ({
  challengeStore: mocks.challengeStore,
  handoffStore: { set: vi.fn(), consume: vi.fn(), countMint: vi.fn() },
}));
vi.mock('@ecency/sdk/hive', () => ({ callRPC: mocks.callRPC, config: {} }));
vi.mock('../services/tenant-service', () => ({ TenantService: {} }));
vi.mock('../services/audit-service', () => ({ AuditService: { log: vi.fn() }, parseClientIp: () => '203.0.113.9' }));
vi.mock('../utils/auth', () => ({
  createToken: vi.fn(() => 'jwt'),
  getTokenExpiry: vi.fn(() => new Date()),
  verifyToken: vi.fn(),
  verifyChallengeSignature: vi.fn(() => true),
}));

const { authRoutes } = await import('./auth');

const post = (path: string, body: Record<string, unknown>) =>
  authRoutes.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const challengeFor = async (username: string) =>
  ((await (await post('/challenge', { username })).json()) as { challenge: string }).challenge;

beforeEach(() => mocks.store.clear());

describe('login challenges', () => {
  it('keeps an earlier challenge valid when another is issued for the same account', async () => {
    const first = await challengeFor('alice');
    await post('/challenge', { username: 'alice' });
    const res = await post('/verify', { username: 'alice', signature: 'sig'.padEnd(130, '0'), challenge: first });
    expect(res.status).toBe(200);
  });

  it('does not accept a challenge issued to another account', async () => {
    const forBob = await challengeFor('bob');
    const res = await post('/verify', { username: 'alice', signature: 'sig'.padEnd(130, '0'), challenge: forBob });
    expect(res.status).toBe(400);
  });

  it('accepts a challenge once', async () => {
    const challenge = await challengeFor('alice');
    const body = { username: 'alice', signature: 'sig'.padEnd(130, '0'), challenge };
    expect((await post('/verify', body)).status).toBe(200);
    expect((await post('/verify', body)).status).toBe(400);
  });
});

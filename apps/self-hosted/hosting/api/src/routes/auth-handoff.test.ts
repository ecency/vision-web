import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handoffSet: vi.fn(),
  handoffConsume: vi.fn(),
  handoffCountMint: vi.fn(),
  challengeStore: { set: vi.fn(), get: vi.fn(), delete: vi.fn() },
  auditLog: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('../utils/redis', () => ({
  challengeStore: mocks.challengeStore,
  handoffStore: {
    set: mocks.handoffSet,
    consume: mocks.handoffConsume,
    countMint: mocks.handoffCountMint,
  },
}));
vi.mock('@ecency/sdk/hive', () => ({
  callRPC: vi.fn(),
  config: {},
}));
vi.mock('../services/tenant-service', () => ({ TenantService: {} }));
vi.mock('../services/audit-service', () => ({
  AuditService: { log: (...args: unknown[]) => mocks.auditLog(...args) },
  parseClientIp: () => '203.0.113.9',
}));
vi.mock('../utils/auth', () => ({
  createToken: vi.fn(() => 'jwt'),
  getTokenExpiry: vi.fn(() => new Date()),
  verifyToken: vi.fn(),
  verifyChallengeSignature: vi.fn(),
}));

const { authRoutes } = await import('./auth');

const post = (path: string, body: Record<string, unknown>) =>
  authRoutes.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const ME_OK = {
  ok: true,
  status: 200,
  json: async () => ({ account: { name: 'alice' } }),
};

describe('handoff mint and exchange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.fetch.mockResolvedValue(ME_OK);
    mocks.handoffSet.mockResolvedValue(undefined);
    mocks.handoffCountMint.mockResolvedValue(1);
  });

  it('mints a one-time code for the account the token belongs to', async () => {
    const response = await post('/handoff', { accessToken: 'a'.repeat(32) });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      code: string;
      username: string;
      expiresAt: string;
    };
    expect(body.username).toBe('alice');
    expect(body.code.length).toBeGreaterThanOrEqual(21);
    // The stored payload carries the token and the /me-derived identity, with
    // the short TTL that makes a captured link worthless in minutes.
    expect(mocks.handoffSet).toHaveBeenCalledWith(
      body.code,
      { accessToken: 'a'.repeat(32), username: 'alice' },
      300,
    );
    // Neither the code nor the token reaches the audit trail.
    expect(JSON.stringify(mocks.auditLog.mock.calls)).not.toContain(body.code);
    expect(JSON.stringify(mocks.auditLog.mock.calls)).not.toContain('a'.repeat(32));
  });

  it('caps minting per account inside the window', async () => {
    mocks.handoffCountMint.mockResolvedValue(11);
    const response = await post('/handoff', { accessToken: 'a'.repeat(32) });
    expect(response.status).toBe(429);
    expect(mocks.handoffSet).not.toHaveBeenCalled();
  });

  it('refuses to mint for a token HiveSigner rejects', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    const response = await post('/handoff', { accessToken: 'b'.repeat(32) });
    expect(response.status).toBe(401);
    expect(mocks.handoffSet).not.toHaveBeenCalled();
  });

  it('exchanges a live code exactly once through the consuming read', async () => {
    mocks.handoffConsume.mockResolvedValueOnce({
      accessToken: 'tok-alice',
      username: 'alice',
    });
    const response = await post('/handoff/exchange', { code: 'c'.repeat(32) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      accessToken: 'tok-alice',
      username: 'alice',
    });
    expect(mocks.handoffConsume).toHaveBeenCalledWith('c'.repeat(32));
  });

  it('404s a missing, expired or already-used code', async () => {
    mocks.handoffConsume.mockResolvedValue(null);
    const response = await post('/handoff/exchange', { code: 'd'.repeat(32) });
    expect(response.status).toBe(404);
  });
});

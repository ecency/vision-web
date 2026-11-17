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

// An access token issued to this app for one account, as HiveSigner writes it.
const hsToken = (author: string, app = 'ecency.app', type = 'posting') =>
  Buffer.from(
    JSON.stringify({ signed_message: { type, app }, authors: [author], timestamp: 1, signatures: ['s'] }),
  ).toString('base64url');
const ALICE_TOKEN = hsToken('alice');

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
    const response = await post('/handoff', { accessToken: ALICE_TOKEN });

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
      { accessToken: ALICE_TOKEN, username: 'alice' },
      300,
    );
    // Neither the code nor the token reaches the audit trail.
    expect(JSON.stringify(mocks.auditLog.mock.calls)).not.toContain(body.code);
    expect(JSON.stringify(mocks.auditLog.mock.calls)).not.toContain(ALICE_TOKEN);
  });

  it('caps minting per account inside the window', async () => {
    mocks.handoffCountMint.mockResolvedValue(11);
    const response = await post('/handoff', { accessToken: ALICE_TOKEN });
    expect(response.status).toBe(429);
    expect(mocks.handoffSet).not.toHaveBeenCalled();
  });

  it.each([
    ['another app', hsToken('alice', 'other.app')],
    ['a code', hsToken('alice', 'ecency.app', 'code')],
    ['not a token', 'z'.repeat(32)],
  ])('refuses %s token without asking HiveSigner', async (_label, accessToken) => {
    const response = await post('/handoff', { accessToken });
    expect(response.status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('refuses a token whose author is not the account HiveSigner names', async () => {
    const response = await post('/handoff', { accessToken: hsToken('mallory') });
    expect(response.status).toBe(401);
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

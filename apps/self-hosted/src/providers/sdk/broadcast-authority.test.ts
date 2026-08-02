import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  broadcastWithHiveAuth: vi.fn(),
  getState: vi.fn(() => ({ session: { username: 'alice', token: 't', expire: 0, key: 'k' } })),
}));

vi.mock('../../features/auth/utils/hive-auth', () => ({
  broadcastWithHiveAuth: mocks.broadcastWithHiveAuth,
}));

// Relative paths: the alias form does not intercept the source imports.
vi.mock('../../store', () => ({
  authenticationStore: { getState: mocks.getState },
  useAuthStore: { getState: mocks.getState },
}));

vi.mock('../../core', () => ({
  InstanceConfigManager: { getConfigValue: () => undefined },
  t: (k: string) => k,
}));

const { createBroadcastAdapter } = await import('./broadcast-adapter');

/**
 * The chain rejects a transfer signed with posting authority, so dropping the
 * requested key type made every active operation through HiveAuth fail: tips,
 * transfers, and any custom_json carrying required_auths.
 */
describe('HiveAuth broadcast authority', () => {
  it('passes the requested authority through', async () => {
    const adapter = createBroadcastAdapter();

    await adapter.broadcastWithHiveAuth?.('alice', [], 'active');

    expect(mocks.broadcastWithHiveAuth).toHaveBeenCalledWith(
      expect.anything(),
      [],
      'active',
    );
  });

  it('passes posting through unchanged for posting operations', async () => {
    mocks.broadcastWithHiveAuth.mockClear();
    const adapter = createBroadcastAdapter();

    await adapter.broadcastWithHiveAuth?.('alice', [], 'posting');

    expect(mocks.broadcastWithHiveAuth).toHaveBeenCalledWith(
      expect.anything(),
      [],
      'posting',
    );
  });
});

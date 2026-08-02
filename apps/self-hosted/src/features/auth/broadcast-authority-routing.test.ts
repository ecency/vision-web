// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hiveAuth: vi.fn(),
  hivesigner: vi.fn(),
  extension: vi.fn(),
  state: { user: undefined as unknown, session: { token: 't' } },
}));

vi.mock('./utils/hive-auth', () => ({
  broadcastWithHiveAuth: mocks.hiveAuth,
  loginWithHiveAuth: vi.fn(),
}));
vi.mock('./utils/hivesigner', () => ({
  broadcastWithHivesigner: mocks.hivesigner,
  getHivesignerLoginUrl: vi.fn(),
  createHivesignerState: vi.fn(),
  resolveHivesignerClientId: vi.fn(),
}));
vi.mock('./utils/hive-extensions', () => ({
  broadcastWithExtension: mocks.extension,
  getDetectedExtensions: vi.fn(() => []),
  getPreferredExtensionId: vi.fn(),
  setPreferredExtensionId: vi.fn(),
  signBufferWithExtension: vi.fn(),
}));
vi.mock('@/store', () => ({
  authenticationStore: { getState: () => mocks.state },
  useAuthStore: { getState: () => mocks.state },
}));
vi.mock('@/core', () => ({
  InstanceConfigManager: { getConfigValue: () => undefined },
  t: (k: string) => k,
}));

const { broadcast } = await import('./auth-actions');

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * The chain rejects a transfer signed with posting authority, so an authority
 * dropped anywhere on the way to the wallet turns into a generic "Transaction
 * failed" that tells the author nothing.
 */
describe('broadcast authority routing', () => {
  it('asks HiveAuth for the active key when the operation needs it', async () => {
    mocks.state.user = { username: 'alice', loginType: 'hiveauth' };

    await broadcast([], { authorityType: 'Active' });

    expect(mocks.hiveAuth).toHaveBeenCalledWith(
      expect.anything(),
      [],
      'active',
    );
  });

  it('defaults HiveAuth to posting when nothing is asked for', async () => {
    mocks.state.user = { username: 'alice', loginType: 'hiveauth' };

    await broadcast([]);

    expect(mocks.hiveAuth).toHaveBeenCalledWith(
      expect.anything(),
      [],
      'posting',
    );
  });

  /**
   * The Hivesigner token is scoped to vote, comment and custom_json. Sending an
   * active operation anyway produced a generic chain failure, so it is refused
   * here with a message that names the fix.
   */
  it('refuses an active operation over Hivesigner instead of failing at the chain', async () => {
    mocks.state.user = {
      username: 'alice',
      loginType: 'hivesigner',
      accessToken: 'tok',
    };

    await expect(broadcast([], { authorityType: 'Active' })).rejects.toThrow(
      /active authority/,
    );
    expect(mocks.hivesigner).not.toHaveBeenCalled();
  });

  it('still allows posting operations over Hivesigner', async () => {
    mocks.state.user = {
      username: 'alice',
      loginType: 'hivesigner',
      accessToken: 'tok',
    };

    await broadcast([], { authorityType: 'Posting' });

    expect(mocks.hivesigner).toHaveBeenCalledWith('tok', []);
  });
});

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

// Logging out has to drop the credentials cached for the account: the signed
// image-upload code (#1462) and the hosting token. Both are keyed by username,
// so another account never uses them, but they would otherwise stay on a shared
// machine after the owner logged out.

const state = vi.hoisted(() => ({ setUser: () => {}, setSession: () => {} }));
vi.mock('@/store', () => ({
  authenticationStore: { getState: () => state },
  useAuthStore: { getState: () => state },
}));
vi.mock('@/core', () => ({
  InstanceConfigManager: { getConfigValue: () => undefined },
  t: (k: string) => k,
}));

const { logout } = await import('./auth-actions');

describe('logout', () => {
  it('forgets the signed image-upload code and the hosting token', () => {
    localStorage.setItem('ecency_image_upload_code', JSON.stringify({ username: 'alice', code: 'c', signedAt: 1 }));
    localStorage.setItem('ecency_hosting_token', JSON.stringify({ username: 'alice', token: 't', expiresAt: 9e15 }));
    logout();
    expect(localStorage.getItem('ecency_image_upload_code')).toBeNull();
    expect(localStorage.getItem('ecency_hosting_token')).toBeNull();
  });
});

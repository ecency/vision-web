import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getByUsername: vi.fn(),
  buildMetaForUri: vi.fn(),
}));

vi.mock('../services/tenant-service', () => ({
  TenantService: { getByUsername: mocks.getByUsername },
}));
vi.mock('../services/post-meta', () => ({
  buildMetaForUri: mocks.buildMetaForUri,
}));

const { metaRoutes } = await import('./meta');

const get = (path: string) => metaRoutes.request(path, { method: 'GET' });

describe('GET /v1/meta/:username', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildMetaForUri.mockResolvedValue('<title>ok</title>');
  });

  it('serves the built snippet for a publishable tenant', async () => {
    mocks.getByUsername.mockResolvedValue({
      username: 'alice',
      subscriptionStatus: 'active',
    });
    const response = await get('/alice?uri=/@alice/my-post');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<title>ok</title>');
    expect(mocks.buildMetaForUri).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'alice' }),
      '/@alice/my-post',
    );
  });

  it('404s the unknown and the unpublishable alike, so nginx serves its fallback', async () => {
    // The same gate the served config has: expired, suspended and
    // never-activated tenants get no generated metadata.
    mocks.getByUsername.mockResolvedValueOnce(null);
    expect((await get('/ghost')).status).toBe(404);

    for (const subscriptionStatus of ['inactive', 'expired', 'suspended']) {
      mocks.getByUsername.mockResolvedValueOnce({
        username: 'alice',
        subscriptionStatus,
      });
      expect((await get('/alice')).status).toBe(404);
    }
    expect(mocks.buildMetaForUri).not.toHaveBeenCalled();
  });
});

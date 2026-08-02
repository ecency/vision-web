import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getByUsername: vi.fn(),
  applyConfigDocument: vi.fn(),
  updateConfig: vi.fn(),
  generateConfigFile: vi.fn(),
}));

vi.mock('../db/client', () => ({ db: { query: vi.fn(), queryOne: vi.fn(), transaction: vi.fn() } }));

vi.mock('../services/tenant-service', () => ({
  TenantService: {
    getByUsername: mocks.getByUsername,
    applyConfigDocument: mocks.applyConfigDocument,
    updateConfig: mocks.updateConfig,
    getBlogUrl: () => 'https://alice.example.test',
  },
  COMMUNITY_NAME: /^hive-\d+$/,
  isReregisterableAbandoned: () => false,
  ABANDONED_REREGISTER_QUARANTINE_HOURS: 1,
}));

vi.mock('../services/config-service', () => ({
  ConfigService: { generateConfigFile: mocks.generateConfigFile },
  isPublishableTenant: (tenant: { subscriptionStatus: string }) =>
    tenant.subscriptionStatus === 'active',
}));

vi.mock('../middleware/auth', () => ({
  authMiddleware: async (c: any, next: () => Promise<void>) => {
    c.set('user', { username: 'alice' });
    await next();
  },
}));

vi.mock('../middleware/x402-paywall', () => ({
  subscriptionPaywall: async (_c: unknown, next: () => Promise<void>) => next(),
  proUpgradePaywall: async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../services/audit-service', () => ({
  AuditService: { log: vi.fn() },
  parseClientIp: () => null,
}));

const { tenantRoutes } = await import('./tenants');

const TENANT = {
  id: 'tenant-1',
  username: 'alice',
  owner: 'alice',
  subscriptionStatus: 'active',
  subscriptionPlan: 'standard',
};

function patch(config: unknown) {
  return tenantRoutes.request('http://localhost/alice', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getByUsername.mockResolvedValue({ ...TENANT });
  mocks.applyConfigDocument.mockImplementation(async () => ({
    tenant: { ...TENANT, config: { version: 1, configuration: {} } },
    discarded: [],
  }));
  mocks.updateConfig.mockImplementation(async () => ({
    ...TENANT,
    config: { version: 1, configuration: {} },
  }));
  mocks.generateConfigFile.mockResolvedValue(undefined);
});

/**
 * The PATCH body used to be validated by a z.union of the full document and the flat keys.
 * A full document that failed for ANY reason fell through to the flat schema, which is all
 * optional and therefore matches any object, stripping it to {}. The save then merged nothing
 * and the route answered 200 "Configuration updated" having stored none of it. Clearing the
 * Version field in the editor is enough to trigger it: a cleared number input sends null.
 */
describe('PATCH /v1/tenants/:username config validation', () => {
  it('rejects a full document with a null version instead of discarding the save', async () => {
    const res = await patch({
      version: null,
      configuration: { instanceConfiguration: { meta: { title: 'New title' } } },
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: { path: string }[] };
    expect(body.error).toBe('Invalid configuration');
    expect(body.issues.map((i) => i.path)).toContain('config.version');
    // The decisive part: nothing was written and no success was reported.
    expect(mocks.applyConfigDocument).not.toHaveBeenCalled();
    expect(mocks.updateConfig).not.toHaveBeenCalled();
  });

  it('rejects a full document whose configuration is not an object', async () => {
    const res = await patch({ version: 1, configuration: 'oops' });

    expect(res.status).toBe(400);
    expect(mocks.applyConfigDocument).not.toHaveBeenCalled();
    expect(mocks.updateConfig).not.toHaveBeenCalled();
  });

  it('applies a valid full document', async () => {
    const doc = {
      version: 1,
      configuration: { instanceConfiguration: { meta: { title: 'New title' } } },
    };

    const res = await patch(doc);

    expect(res.status).toBe(200);
    expect(mocks.applyConfigDocument).toHaveBeenCalledWith('alice', doc);
    expect(mocks.updateConfig).not.toHaveBeenCalled();
  });

  it('still accepts the flat key form', async () => {
    // The flat vocabulary predates the Configuration Editor and shares its shape with
    // signup; a body with no `configuration` key is unambiguously that form.
    const res = await patch({ theme: 'dark', title: 'Flat title' });

    expect(res.status).toBe(200);
    expect(mocks.updateConfig).toHaveBeenCalledWith('alice', { theme: 'dark', title: 'Flat title' });
    expect(mocks.applyConfigDocument).not.toHaveBeenCalled();
  });

  it('rejects an invalid flat value rather than storing part of the body', async () => {
    const res = await patch({ theme: 'neon' });

    expect(res.status).toBe(400);
    expect(mocks.updateConfig).not.toHaveBeenCalled();
  });

  it('reports values the server refused to store', async () => {
    mocks.applyConfigDocument.mockResolvedValue({
      tenant: { ...TENANT, config: { version: 1, configuration: {} } },
      discarded: [
        {
          path: 'configuration.instanceConfiguration.type',
          reason: 'the instance type is set when the instance is created and cannot be changed here',
        },
      ],
    });

    const res = await patch({
      version: 1,
      configuration: { instanceConfiguration: { type: 'community' } },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { discarded: { path: string }[]; message: string };
    expect(body.discarded).toHaveLength(1);
    expect(body.discarded[0].path).toBe('configuration.instanceConfiguration.type');
    expect(body.message).toContain('not applied');
  });

  it('reports nothing discarded on an ordinary save', async () => {
    const res = await patch({ version: 1, configuration: { general: { theme: 'dark' } } });

    const body = (await res.json()) as { discarded: unknown[]; message: string };
    expect(body.discarded).toEqual([]);
    expect(body.message).toBe('Configuration updated');
  });
});

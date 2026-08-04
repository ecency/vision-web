import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getByUsername: vi.fn(),
  applyConfigDocument: vi.fn(),
  updateConfig: vi.fn(),
  publishConfigFile: vi.fn(),
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
  // Read at module scope by the PATCH body schema, so these are the real values: stubbing them
  // loosely would let this suite accept reset paths the deployed route rejects.
  CONFIG_RESET_PATH: /^configuration(\.[A-Za-z][A-Za-z0-9_-]*)+$/,
  MAX_RESET_PATHS: 32,
}));

vi.mock('../services/config-service', () => ({
  ConfigService: { publishConfigFile: mocks.publishConfigFile },
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

function patch(config: unknown, reset?: unknown) {
  return tenantRoutes.request('http://localhost/alice', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reset === undefined ? { config } : { config, reset }),
  });
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getByUsername.mockResolvedValue({ ...TENANT });
  mocks.applyConfigDocument.mockImplementation(async () => ({
    tenant: { ...TENANT, config: { version: 1, configuration: {} } },
    discarded: [],
    reset: [],
  }));
  mocks.updateConfig.mockImplementation(async () => ({
    ...TENANT,
    config: { version: 1, configuration: {} },
  }));
  mocks.publishConfigFile.mockResolvedValue(undefined);
});

/**
 * The PATCH body used to be validated by a z.union of the full document and the flat keys.
 * A full document that failed for ANY reason fell through to the flat schema, which is all
 * optional and therefore matches any object, stripping it to {}. The save then merged nothing
 * and the route answered 200 "Configuration updated" having stored none of it. Clearing the
 * Version field in the editor is enough to trigger it: a cleared number input sends null.
 */
describe('PATCH /v1/tenants/:username publication', () => {
  it('hands the publisher a name, never the row it just wrote', async () => {
    // The served file has more than one writer now: the Hivesigner reconcile can
    // commit a client id for this tenant while a save is in flight. Whichever of
    // the two publishes its OWN snapshot last puts the other's change back on
    // disk while the database keeps both, and nothing afterwards notices the
    // file and the row disagree. Passing an identifier is what makes that
    // impossible, because the content is then resolved after the commit, inside
    // the lock. That the content really is the newest committed config is proven
    // end to end against the real ConfigService in hivesigner-registry.test.ts.
    await patch({ version: 1, configuration: { general: { theme: 'dark' } } });

    const args = mocks.publishConfigFile.mock.calls[0];
    expect(args).toEqual(['alice']);
    expect(
      args.some((arg: unknown) => !!arg && typeof arg === 'object' && 'config' in (arg as object))
    ).toBe(false);
  });
});

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
    expect(mocks.applyConfigDocument).toHaveBeenCalledWith('alice', doc, []);
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
      reset: [],
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

/**
 * A value stored with the wrong primitive type cannot be replaced: the merge only accepts a
 * value that agrees with what is stored. `reset` names stored values to drop so the document in
 * the SAME request can write the replacement. It rides on this PATCH rather than an endpoint of
 * its own, so it is authorized exactly as a save is: there is no second door to the config.
 */
describe('PATCH /v1/tenants/:username config reset', () => {
  const doc = { version: 1, configuration: { general: { theme: 'dark' } } };

  it('passes the requested paths to the service and reports what was cleared', async () => {
    mocks.applyConfigDocument.mockResolvedValue({
      tenant: { ...TENANT, config: { version: 1, configuration: {} } },
      discarded: [],
      reset: ['configuration.general.theme'],
    });

    const res = await patch(doc, ['configuration.general.theme']);

    expect(res.status).toBe(200);
    expect(mocks.applyConfigDocument).toHaveBeenCalledWith('alice', doc, [
      'configuration.general.theme',
    ]);
    const body = (await res.json()) as { reset: string[] };
    expect(body.reset).toEqual(['configuration.general.theme']);
  });

  it('refuses a caller who does not control the instance', async () => {
    // The same 403 an ordinary save gets. A reset must never be reachable by anyone a save is
    // not, and it is checked before the body is looked at.
    mocks.getByUsername.mockResolvedValue({ ...TENANT, owner: 'bob' });

    const res = await patch(doc, ['configuration.general.theme']);

    expect(res.status).toBe(403);
    expect(mocks.applyConfigDocument).not.toHaveBeenCalled();
    expect(mocks.updateConfig).not.toHaveBeenCalled();
    expect(mocks.publishConfigFile).not.toHaveBeenCalled();
  });

  it('refuses a reset sent without the document that replaces the value', async () => {
    // A bare reset would be a delete. Requiring the document keeps it a repair, and means a
    // caller cannot remove anything without stating what it expects to be stored.
    const res = await patch({ theme: 'dark' }, ['configuration.general.theme']);

    expect(res.status).toBe(400);
    expect(mocks.updateConfig).not.toHaveBeenCalled();
    expect(mocks.applyConfigDocument).not.toHaveBeenCalled();
  });

  it('refuses paths that are not values inside the configuration document', async () => {
    for (const path of [
      'configuration',
      'version',
      'general.theme',
      'configuration.__proto__.polluted',
      'configuration.general.0',
      '../../etc/passwd',
    ]) {
      const res = await patch(doc, [path]);
      expect(res.status, path).toBe(400);
    }
    expect(mocks.applyConfigDocument).not.toHaveBeenCalled();
  });

  it('refuses a reset that is not a list of paths', async () => {
    for (const reset of ['configuration.general.theme', 42, { path: 'x' }, [42]]) {
      const res = await patch(doc, reset);
      expect(res.status, JSON.stringify(reset)).toBe(400);
    }
    expect(mocks.applyConfigDocument).not.toHaveBeenCalled();
  });

  it('refuses more paths than one repair can need', async () => {
    const many = Array.from({ length: 33 }, (_, i) => `configuration.general.field${i}`);

    const res = await patch(doc, many);

    expect(res.status).toBe(400);
    expect(mocks.applyConfigDocument).not.toHaveBeenCalled();
  });

  it('answers an ordinary save with an empty reset list', async () => {
    const res = await patch(doc);

    const body = (await res.json()) as { reset: unknown[] };
    expect(body.reset).toEqual([]);
  });

  it('answers a flat-key save with an empty reset list', async () => {
    const res = await patch({ theme: 'dark' });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { reset: unknown[] };
    expect(body.reset).toEqual([]);
  });
});

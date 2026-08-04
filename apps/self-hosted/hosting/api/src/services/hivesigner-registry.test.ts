import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callRPC: vi.fn(),
  getActiveTenants: vi.fn(),
  applyConfigDocument: vi.fn(),
  generateConfigFile: vi.fn(),
}));

vi.mock('@ecency/sdk/hive', () => ({
  callRPC: mocks.callRPC,
  config: { nodes: [] },
  setNodes: vi.fn(),
}));

vi.mock('./tenant-service', () => ({
  TenantService: {
    getActiveTenants: mocks.getActiveTenants,
    applyConfigDocument: mocks.applyConfigDocument,
  },
}));

// isPublishableTenant is deliberately NOT mocked: the rule about which tenants may be
// served is shared, and a copy of it here would let the two drift.
vi.mock('./config-service', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    ConfigService: { generateConfigFile: mocks.generateConfigFile },
  };
});

const {
  decideClientId,
  clientIdDocument,
  parseRegisteredRedirectUris,
  reconcileHivesignerClientIds,
  tenantRedirectUris,
} = await import('./hivesigner-registry');

const APP = 'ecency.app';
const BASE = 'blogs.ecency.com';

function tenant(over: Record<string, unknown> = {}) {
  return {
    id: 'id-' + (over.username ?? 'alice'),
    username: 'alice',
    owner: 'alice',
    subscriptionStatus: 'active',
    subscriptionPlan: 'standard',
    customDomain: null,
    customDomainVerified: false,
    config: {},
    ...over,
  } as never;
}

function metadata(uris: unknown) {
  return JSON.stringify({ profile: { name: 'App', redirect_uris: uris } });
}

describe('tenantRedirectUris', () => {
  it('is the tenant subdomain callback for an instance with no custom domain', () => {
    expect(
      tenantRedirectUris({ username: 'alice', customDomain: null, customDomainVerified: false }, BASE)
    ).toEqual(['https://alice.blogs.ecency.com/auth']);
  });

  it('adds the custom domain once it is VERIFIED, because both origins serve the same config', () => {
    expect(
      tenantRedirectUris(
        { username: 'alice', customDomain: 'alice.example', customDomainVerified: true },
        BASE
      )
    ).toEqual(['https://alice.blogs.ecency.com/auth', 'https://alice.example/auth']);
  });

  it('never includes a custom domain that has only been CLAIMED', () => {
    // Registering a name someone merely typed into the form would let whoever
    // actually controls it receive callbacks carrying tokens for the app.
    expect(
      tenantRedirectUris(
        { username: 'alice', customDomain: 'not-mine.example', customDomainVerified: false },
        BASE
      )
    ).toEqual(['https://alice.blogs.ecency.com/auth']);
  });

  it('lower-cases both hosts, since the match on chain is exact', () => {
    expect(
      tenantRedirectUris(
        { username: 'Alice', customDomain: 'Alice.Example', customDomainVerified: true },
        BASE
      )
    ).toEqual(['https://alice.blogs.ecency.com/auth', 'https://alice.example/auth']);
  });
});

describe('parseRegisteredRedirectUris', () => {
  it('reads the registered array', () => {
    expect(parseRegisteredRedirectUris(metadata(['https://a/auth', 'https://b/auth']))).toEqual([
      'https://a/auth',
      'https://b/auth',
    ]);
  });

  it('keeps only the strings', () => {
    expect(parseRegisteredRedirectUris(metadata(['https://a/auth', 42, null]))).toEqual([
      'https://a/auth',
    ]);
  });

  it('reports an app that has registered nothing as an empty list', () => {
    expect(parseRegisteredRedirectUris(JSON.stringify({ profile: { name: 'App' } }))).toEqual([]);
  });

  it.each([
    ['absent metadata', undefined],
    ['an empty string', '   '],
    ['a non-string', { profile: {} }],
    ['invalid JSON', '{not json'],
    ['a JSON array at the root', '[]'],
    ['no profile', JSON.stringify({ other: 1 })],
    ['a non-array redirect_uris', metadata('https://a/auth')],
  ])('THROWS on %s rather than reporting an empty registration', (_label, input) => {
    // An empty list is a real answer that disables every tenant, so nothing that
    // merely FAILED to be read may be allowed to look like one.
    expect(() => parseRegisteredRedirectUris(input)).toThrow();
  });
});

describe('decideClientId', () => {
  const registered = (...uris: string[]) => new Set(uris);

  it('enables when every serving origin is registered and nothing is stored', () => {
    expect(
      decideClientId(undefined, ['https://a/auth'], registered('https://a/auth'), APP)
    ).toBe('enable');
  });

  it('leaves an instance that is already enabled and still registered', () => {
    expect(decideClientId(APP, ['https://a/auth'], registered('https://a/auth'), APP)).toBe('leave');
  });

  it('does NOT enable when only some of the serving origins are registered', () => {
    // One config file serves the subdomain and the verified custom domain, and the
    // SPA builds its redirect_uri from window.location.origin. Enabling here gives
    // every visitor on the unregistered origin a button that fails.
    expect(
      decideClientId(
        undefined,
        ['https://a/auth', 'https://custom/auth'],
        registered('https://a/auth'),
        APP
      )
    ).toBe('leave');
  });

  it('disables when a client id it set points at a URI that has left the array', () => {
    expect(decideClientId(APP, ['https://a/auth'], registered(), APP)).toBe('disable');
  });

  it('leaves a blank stored value alone when nothing is registered', () => {
    expect(decideClientId('', ['https://a/auth'], registered(), APP)).toBe('leave');
    expect(decideClientId(undefined, ['https://a/auth'], registered(), APP)).toBe('leave');
  });

  it.each([
    ['registered', registered('https://a/auth')],
    ['not registered', registered()],
  ])("never touches the owner's own Hivesigner app when %s", (_label, set) => {
    // Their app, their registration, against URIs this service knows nothing about.
    expect(decideClientId('myblog.app', ['https://a/auth'], set, APP)).toBe('leave');
  });

  it('does not enable on an empty required list', () => {
    // `every` is vacuously true on an empty array, which would enable an instance
    // whose origins were never worked out at all.
    expect(decideClientId(undefined, [], registered('https://a/auth'), APP)).toBe('leave');
  });

  it('recognises a stored value that differs only by case or padding', () => {
    expect(decideClientId('  ECENCY.APP ', ['https://a/auth'], registered(), APP)).toBe('disable');
  });
});

describe('clientIdDocument', () => {
  it('nests the value where the SPA reads it', () => {
    expect(clientIdDocument(APP)).toEqual({
      configuration: { general: { hivesigner: { clientId: APP } } },
    });
  });

  it('disables with an empty string, which the SPA treats as absent', () => {
    // The guarded merge has no delete, and a null is stripped from a config
    // document before it is merged, so an empty string is what withdrawal looks like.
    expect(clientIdDocument('')).toEqual({
      configuration: { general: { hivesigner: { clientId: '' } } },
    });
  });
});

describe('reconcileHivesignerClientIds', () => {
  beforeEach(() => {
    mocks.callRPC.mockReset();
    mocks.getActiveTenants.mockReset();
    mocks.applyConfigDocument.mockReset();
    mocks.generateConfigFile.mockReset();
  });

  function chainHas(...uris: string[]) {
    mocks.callRPC.mockResolvedValue([{ posting_json_metadata: metadata(uris) }]);
  }

  it('enables a registered tenant through the guarded config path and publishes it', async () => {
    chainHas('https://alice.blogs.ecency.com/auth');
    mocks.getActiveTenants.mockResolvedValue([tenant()]);
    mocks.applyConfigDocument.mockResolvedValue({
      tenant: tenant({ subscriptionStatus: 'active' }),
    });

    const result = await reconcileHivesignerClientIds(APP);

    expect(result.enabled).toEqual(['alice']);
    expect(mocks.applyConfigDocument).toHaveBeenCalledWith('alice', clientIdDocument(APP));
    expect(mocks.generateConfigFile).toHaveBeenCalledTimes(1);
  });

  it('leaves an unregistered tenant with no client id and writes nothing for it', async () => {
    chainHas('https://someone-else.blogs.ecency.com/auth');
    mocks.getActiveTenants.mockResolvedValue([tenant()]);

    const result = await reconcileHivesignerClientIds(APP);

    expect(result.enabled).toEqual([]);
    expect(result.unchanged).toBe(1);
    expect(mocks.applyConfigDocument).not.toHaveBeenCalled();
  });

  it('withdraws a client id whose URI is no longer on chain', async () => {
    chainHas();
    mocks.getActiveTenants.mockResolvedValue([
      tenant({ config: { configuration: { general: { hivesigner: { clientId: APP } } } } }),
    ]);
    mocks.applyConfigDocument.mockResolvedValue({ tenant: tenant() });

    const result = await reconcileHivesignerClientIds(APP);

    expect(result.disabled).toEqual(['alice']);
    expect(mocks.applyConfigDocument).toHaveBeenCalledWith('alice', clientIdDocument(''));
  });

  it('writes NOTHING when the chain cannot be read', async () => {
    // Treating an unreadable account as "nothing is registered" would withdraw the
    // login method from every tenant at once on one bad RPC response.
    mocks.callRPC.mockRejectedValue(new Error('ECONNRESET'));
    mocks.getActiveTenants.mockResolvedValue([tenant()]);

    await expect(reconcileHivesignerClientIds(APP)).rejects.toThrow('ECONNRESET');
    expect(mocks.applyConfigDocument).not.toHaveBeenCalled();
    expect(mocks.getActiveTenants).not.toHaveBeenCalled();
  });

  it('writes nothing when the app account does not exist', async () => {
    mocks.callRPC.mockResolvedValue([]);
    await expect(reconcileHivesignerClientIds(APP)).rejects.toThrow(/does not exist/);
    expect(mocks.applyConfigDocument).not.toHaveBeenCalled();
  });

  it('carries on past a tenant whose write fails, and names it for the next pass', async () => {
    chainHas('https://alice.blogs.ecency.com/auth', 'https://bob.blogs.ecency.com/auth');
    mocks.getActiveTenants.mockResolvedValue([
      tenant({ username: 'alice' }),
      tenant({ username: 'bob' }),
    ]);
    mocks.applyConfigDocument
      .mockRejectedValueOnce(new Error('deadlock detected'))
      .mockResolvedValueOnce({ tenant: tenant({ username: 'bob' }) });

    const result = await reconcileHivesignerClientIds(APP);

    expect(result.failed).toEqual(['alice']);
    expect(result.enabled).toEqual(['bob']);
  });

  it('stores the change but does not publish for a tenant that may not be served', async () => {
    // nginx serves any file that exists with no subscription check.
    chainHas('https://alice.blogs.ecency.com/auth');
    mocks.getActiveTenants.mockResolvedValue([tenant()]);
    mocks.applyConfigDocument.mockResolvedValue({
      tenant: tenant({ subscriptionStatus: 'expired' }),
    });

    const result = await reconcileHivesignerClientIds(APP);

    expect(result.enabled).toEqual(['alice']);
    expect(mocks.generateConfigFile).not.toHaveBeenCalled();
  });

  it('requires BOTH origins before enabling a tenant that serves a verified custom domain', async () => {
    chainHas('https://alice.blogs.ecency.com/auth');
    mocks.getActiveTenants.mockResolvedValue([
      tenant({ customDomain: 'alice.example', customDomainVerified: true }),
    ]);

    const result = await reconcileHivesignerClientIds(APP);

    expect(result.enabled).toEqual([]);
    expect(mocks.applyConfigDocument).not.toHaveBeenCalled();
  });
});

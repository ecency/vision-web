import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callRPC: vi.fn(),
  getActiveTenants: vi.fn(),
  applyConfigDocument: vi.fn(),
  getByUsername: vi.fn(),
  lockedRow: vi.fn(),
  lockedSql: vi.fn(),
  written: vi.fn(),
}));

vi.mock('@ecency/sdk/hive', () => ({
  callRPC: mocks.callRPC,
  config: { nodes: [] },
  setNodes: vi.fn(),
}));

// The write path re-reads the row FOR UPDATE and decides again from it, so the
// transaction is modelled rather than stubbed away: `lockedRow` is what the
// database would hand back at that moment, which is how a config save landing
// between the listing and the write is expressed.
vi.mock('../db/client', () => ({
  db: {
    transaction: async (fn: (client: unknown) => Promise<unknown>) =>
      fn({
        query: async (sql: string, params: unknown[]) => {
          mocks.lockedSql(sql, params);
          return { rows: mocks.lockedRow() };
        },
      }),
  },
  // config-service serialises file writes on this; there is one process here.
  withAdvisoryLock: (_ns: number, _key: number, fn: () => Promise<unknown>) => fn(),
}));

vi.mock('./tenant-service', () => ({
  TenantService: {
    getBlogUrl: (t: any) => `https://${t.username}.blogs.ecency.com`,
    getActiveTenants: mocks.getActiveTenants,
    applyConfigDocument: mocks.applyConfigDocument,
    getByUsername: mocks.getByUsername,
  },
}));

// ConfigService is NOT mocked. What ends up in a tenant's served file is the
// thing under test here, and a stand-in for the publisher would be a copy of the
// rule it is supposed to be checked against. The filesystem is mocked instead,
// so the assertions are about the bytes that reach disk.
vi.mock('fs', () => ({
  promises: {
    mkdir: async () => undefined,
    readFile: async () => {
      const missing = new Error('ENOENT') as NodeJS.ErrnoException;
      missing.code = 'ENOENT';
      throw missing;
    },
    writeFile: async (file: string, contents: string) => mocks.written(file, contents),
    unlink: async () => undefined,
  },
}));

const {
  decideClientId,
  clientIdDocument,
  parseRegisteredRedirectUris,
  reconcileHivesignerClientIds,
  tenantRedirectUris,
} = await import('./hivesigner-registry');

const APP = 'ecency.app';
const BASE = 'blogs.ecency.com';

/** A stored config that already carries the shared client id. */
const enabledConfig = { configuration: { general: { hivesigner: { clientId: APP } } } };

/** A stored config carrying an app the owner registered themselves. */
const ownersConfig = { configuration: { general: { hivesigner: { clientId: 'myblog.app' } } } };

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

/** The same tenant as the database row the locked re-read returns. */
function row(over: Record<string, unknown> = {}) {
  const t = tenant(over) as unknown as Record<string, unknown>;
  return {
    id: t.id,
    username: t.username,
    owner: t.owner,
    subscription_status: t.subscriptionStatus,
    subscription_plan: t.subscriptionPlan,
    subscription_started_at: null,
    subscription_expires_at: null,
    custom_domain: t.customDomain,
    custom_domain_verified: t.customDomainVerified,
    custom_domain_verified_at: null,
    config: t.config,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
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
    mocks.written.mockReset();
    // By default the locked re-read agrees with the listing, and the read that
    // the publish does afterwards agrees with both.
    mocks.lockedRow.mockReset().mockReturnValue([row()]);
    mocks.lockedSql.mockReset();
    mocks.applyConfigDocument.mockResolvedValue({ tenant: tenant({ config: enabledConfig }) });
    // Answers for whoever is asked, so a pass over several tenants cannot appear
    // to publish the same file twice.
    mocks.getByUsername
      .mockReset()
      .mockImplementation(async (username: string) =>
        tenant({ username, config: enabledConfig })
      );
  });

  /** The config document written to a tenant's served file, if one was. */
  function publishedConfig(username: string): any | undefined {
    const write = mocks.written.mock.calls.find((call: any[]) =>
      String(call[0]).endsWith(`${username}.json`)
    );
    return write ? JSON.parse(write[1]) : undefined;
  }

  function publishedClientId(username: string): unknown {
    return publishedConfig(username)?.configuration?.general?.hivesigner?.clientId;
  }

  it('takes a row lock on the re-read, which is what makes the decision safe', async () => {
    // Re-reading without locking narrows the window instead of closing it: a
    // config save could still commit between this read and the write. The lock
    // is what makes a concurrent save either land first and be what this
    // decides from, or wait and land on top.
    chainHas('https://alice.blogs.ecency.com/auth');
    mocks.getActiveTenants.mockResolvedValue([tenant()]);

    await reconcileHivesignerClientIds(APP);

    expect(mocks.lockedSql).toHaveBeenCalledWith(expect.stringMatching(/FOR UPDATE\s*$/), [
      'alice',
    ]);
  });

  function chainHas(...uris: string[]) {
    mocks.callRPC.mockResolvedValue([{ posting_json_metadata: metadata(uris) }]);
  }

  it('enables a registered tenant through the guarded config path and publishes it', async () => {
    chainHas('https://alice.blogs.ecency.com/auth');
    mocks.getActiveTenants.mockResolvedValue([tenant()]);

    const result = await reconcileHivesignerClientIds(APP);

    expect(result.enabled).toEqual(['alice']);
    // Fourth argument is the transaction the locked read happened in: the
    // decision and the write have to be the same unit of work.
    expect(mocks.applyConfigDocument).toHaveBeenCalledWith(
      'alice',
      clientIdDocument(APP),
      [],
      expect.objectContaining({ query: expect.any(Function) })
    );
    expect(publishedClientId('alice')).toBe(APP);
  });

  it('publishes the row as it stands AFTER the commit, not the row it committed', async () => {
    // The same hazard as the locked re-read, one step later. The transaction
    // commits, and before the file is written the owner saves an app of their
    // own. Publishing the committed snapshot would put the older document on
    // disk while the database holds the newer one, and that split is the worst
    // outcome available: readers get a client id the row does not mention, and
    // nothing afterwards notices the two disagree.
    chainHas('https://alice.blogs.ecency.com/auth');
    mocks.getActiveTenants.mockResolvedValue([tenant()]);
    mocks.applyConfigDocument.mockResolvedValue({ tenant: tenant({ config: enabledConfig }) });
    // The save lands in the gap between COMMIT and the file write.
    mocks.getByUsername.mockResolvedValue(tenant({ config: ownersConfig }));

    await reconcileHivesignerClientIds(APP);

    expect(publishedClientId('alice')).toBe('myblog.app');
  });

  it('does not publish a tenant that lapsed between the commit and the write', async () => {
    // publishConfigFile re-reads for this reason too: nginx serves any file that
    // exists, with no subscription check.
    chainHas('https://alice.blogs.ecency.com/auth');
    mocks.getActiveTenants.mockResolvedValue([tenant()]);
    mocks.getByUsername.mockResolvedValue(tenant({ subscriptionStatus: 'expired' }));

    const result = await reconcileHivesignerClientIds(APP);

    expect(result.enabled).toEqual(['alice']);
    expect(publishedConfig('alice')).toBeUndefined();
  });

  it("does not overwrite an owner's app saved after the listing was taken", async () => {
    // The listing said the slot was empty, so the pass intends to enable. By the
    // time the row is locked the owner has saved their own app. Writing the
    // shared id here would destroy that value for good: the next pass would see
    // an id it manages and leave it, so nothing would ever put theirs back.
    chainHas('https://alice.blogs.ecency.com/auth');
    mocks.getActiveTenants.mockResolvedValue([tenant()]);
    mocks.lockedRow.mockReturnValue([
      row({ config: { configuration: { general: { hivesigner: { clientId: 'myblog.app' } } } } }),
    ]);

    const result = await reconcileHivesignerClientIds(APP);

    expect(result.enabled).toEqual([]);
    expect(result.unchanged).toBe(1);
    expect(mocks.applyConfigDocument).not.toHaveBeenCalled();
  });

  it('does not enable on an origin set that grew after the listing was taken', async () => {
    // A custom domain verified in that window adds a second serving origin the
    // listing knew nothing about. Enabling on the strength of the first one is
    // exactly the button that fails for everyone arriving on the second.
    chainHas('https://alice.blogs.ecency.com/auth');
    mocks.getActiveTenants.mockResolvedValue([tenant()]);
    mocks.lockedRow.mockReturnValue([
      row({ customDomain: 'alice.example', customDomainVerified: true }),
    ]);

    const result = await reconcileHivesignerClientIds(APP);

    expect(result.enabled).toEqual([]);
    expect(mocks.applyConfigDocument).not.toHaveBeenCalled();
  });

  it('writes nothing for a tenant whose row disappeared after the listing', async () => {
    chainHas('https://alice.blogs.ecency.com/auth');
    mocks.getActiveTenants.mockResolvedValue([tenant()]);
    mocks.lockedRow.mockReturnValue([]);

    const result = await reconcileHivesignerClientIds(APP);

    expect(result.unchanged).toBe(1);
    expect(mocks.applyConfigDocument).not.toHaveBeenCalled();
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
    const enabled = { configuration: { general: { hivesigner: { clientId: APP } } } };
    mocks.getActiveTenants.mockResolvedValue([tenant({ config: enabled })]);
    mocks.lockedRow.mockReturnValue([row({ config: enabled })]);

    const result = await reconcileHivesignerClientIds(APP);

    expect(result.disabled).toEqual(['alice']);
    expect(mocks.applyConfigDocument).toHaveBeenCalledWith(
      'alice',
      clientIdDocument(''),
      [],
      expect.anything()
    );
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
    mocks.lockedRow
      .mockReturnValueOnce([row({ username: 'alice' })])
      .mockReturnValueOnce([row({ username: 'bob' })]);
    mocks.applyConfigDocument
      .mockRejectedValueOnce(new Error('deadlock detected'))
      .mockResolvedValueOnce({ tenant: tenant({ username: 'bob' }) });

    const result = await reconcileHivesignerClientIds(APP);

    expect(result.failed).toEqual(['alice']);
    expect(result.enabled).toEqual(['bob']);
  });

  it('neither stores nor publishes for a tenant that stopped being served', async () => {
    // nginx serves any file that exists with no subscription check, and a tenant
    // that lapsed between the listing and the locked read is not owed a login
    // method it never had.
    chainHas('https://alice.blogs.ecency.com/auth');
    mocks.getActiveTenants.mockResolvedValue([tenant()]);
    mocks.lockedRow.mockReturnValue([row({ subscriptionStatus: 'expired' })]);

    const result = await reconcileHivesignerClientIds(APP);

    expect(result.enabled).toEqual([]);
    expect(result.unchanged).toBe(1);
    expect(mocks.applyConfigDocument).not.toHaveBeenCalled();
    expect(publishedConfig('alice')).toBeUndefined();
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

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Repairing a value stored with the wrong type.
 *
 * mergeConfigGuarded only lets a stored value be replaced by one that agrees with its shape, so
 * a key that already holds the wrong type is frozen: the save answers 200, the field comes back
 * in `discarded`, and the bad value survives. The guard is doing real work (a string "false"
 * must never stand in for a boolean), so the way out is an explicit reset that drops the stored
 * value and lets the SAME save write the replacement into the now-absent slot.
 *
 * These run against applyConfigDocument with the database mocked, so they exercise the real
 * order of sanitize, reset and merge rather than the pieces separately.
 */

const mocks = vi.hoisted(() => ({
  queryOne: vi.fn(),
}));

vi.mock('../db/client', () => ({
  db: { query: vi.fn(), queryOne: mocks.queryOne, transaction: vi.fn() },
}));

const { TenantService, CONFIG_RESET_PATH, MAX_RESET_PATHS, PINNED_INSTANCE_FIELDS } = await import(
  './tenant-service'
);

/** The config as stored today, with `mutate` applied to break or extend it. */
async function storedConfig(mutate: (config: any) => void = () => {}): Promise<any> {
  const config = await TenantService.buildConfig('alice', undefined, 'alice');
  mutate(config);
  return config;
}

/** Stand in for the tenants row so applyConfigDocument can read and write it. */
let saved: any = null;

function seedTenant(config: any) {
  saved = null;
  mocks.queryOne.mockReset();
  mocks.queryOne.mockImplementation(async (sql: string, params: any[]) => {
    if (sql.trim().startsWith('SELECT')) {
      return {
        id: 'tenant-1',
        username: 'alice',
        owner: 'alice',
        subscription_status: 'active',
        subscription_plan: 'standard',
        config,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
    // The UPDATE: params[1] is the JSON the server decided to store.
    saved = JSON.parse(params[1]);
    return {
      id: 'tenant-1',
      username: 'alice',
      owner: 'alice',
      subscription_status: 'active',
      subscription_plan: 'standard',
      config: saved,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });
}

/** A full config document carrying just the instance section given. */
function instanceDoc(instanceConfiguration: any) {
  return { version: 1, configuration: { instanceConfiguration } };
}

beforeEach(() => {
  saved = null;
  mocks.queryOne.mockReset();
});

describe('a malformed scalar can be repaired through the editor', () => {
  it('was stuck before the reset existed', async () => {
    // The behaviour the issue describes, kept as the baseline the fix is measured against:
    // a correctly typed value is refused, reported, and the bad value survives.
    seedTenant(
      await storedConfig((c) => {
        c.configuration.general.theme = 7;
      })
    );

    const { discarded } = await TenantService.applyConfigDocument('alice', {
      version: 1,
      configuration: { general: { theme: 'dark' } },
    });

    expect(saved.configuration.general.theme).toBe(7);
    expect(discarded.map((d) => d.path)).toEqual(['configuration.general.theme']);
  });

  it('replaces the malformed scalar when the same save asks for a reset', async () => {
    seedTenant(
      await storedConfig((c) => {
        c.configuration.general.theme = 7;
      })
    );

    const { discarded, reset } = await TenantService.applyConfigDocument(
      'alice',
      { version: 1, configuration: { general: { theme: 'dark' } } },
      ['configuration.general.theme']
    );

    expect(saved.configuration.general.theme).toBe('dark');
    expect(reset).toEqual(['configuration.general.theme']);
    expect(discarded).toEqual([]);
    // and nothing else in the section moved
    expect(saved.configuration.general.imageProxy).toBe('https://i.ecency.com');
  });

  it('repairs a scalar standing where a whole block belongs', async () => {
    // features.hive is the case tenant-service-hive-seed.test.ts documents as unrepairable:
    // a bare string stored where the block belongs refuses every later object write.
    seedTenant(
      await storedConfig((c) => {
        c.configuration.instanceConfiguration.features.hive = 'full';
      })
    );

    const { reset } = await TenantService.applyConfigDocument(
      'alice',
      instanceDoc({ features: { hive: { readerLayer: 'standard', authorRewards: 'author' } } }),
      ['configuration.instanceConfiguration.features.hive']
    );

    expect(saved.configuration.instanceConfiguration.features.hive).toEqual({
      readerLayer: 'standard',
      authorRewards: 'author',
    });
    expect(reset).toEqual(['configuration.instanceConfiguration.features.hive']);
  });

  it('repairs an array whose stored elements are of the wrong type', async () => {
    // isValidArrayReplacement takes the element type from the stored array, so an array of
    // numbers refuses every array of strings: the same trap one level down.
    seedTenant(
      await storedConfig((c) => {
        c.configuration.instanceConfiguration.features.auth.methods = [1, 2];
      })
    );

    const { reset } = await TenantService.applyConfigDocument(
      'alice',
      instanceDoc({ features: { auth: { methods: ['keychain'] } } }),
      ['configuration.instanceConfiguration.features.auth.methods']
    );

    expect(saved.configuration.instanceConfiguration.features.auth.methods).toEqual(['keychain']);
    expect(reset).toEqual(['configuration.instanceConfiguration.features.auth.methods']);
  });

  it('repairs several fields in one save', async () => {
    seedTenant(
      await storedConfig((c) => {
        c.configuration.general.theme = 7;
        c.configuration.instanceConfiguration.meta.title = 42;
      })
    );

    const { reset } = await TenantService.applyConfigDocument(
      'alice',
      {
        version: 1,
        configuration: {
          general: { theme: 'dark' },
          instanceConfiguration: { meta: { title: 'My blog' } },
        },
      },
      ['configuration.general.theme', 'configuration.instanceConfiguration.meta.title']
    );

    expect(saved.configuration.general.theme).toBe('dark');
    expect(saved.configuration.instanceConfiguration.meta.title).toBe('My blog');
    expect(reset).toHaveLength(2);
  });
});

describe('the type guard is still enforced', () => {
  it('refuses a mismatched value on a save that asks for no reset', async () => {
    seedTenant(await storedConfig());

    const { discarded, reset } = await TenantService.applyConfigDocument('alice', {
      version: 1,
      configuration: {
        general: { theme: 42 },
        instanceConfiguration: { features: { likes: { enabled: 'false' } } },
      },
    });

    expect(saved.configuration.general.theme).toBe('system');
    expect(saved.configuration.instanceConfiguration.features.likes.enabled).toBe(true);
    expect(reset).toEqual([]);
    expect(discarded.map((d) => d.path).sort()).toEqual([
      'configuration.general.theme',
      'configuration.instanceConfiguration.features.likes.enabled',
    ]);
  });

  it('refuses a mismatched value at a path the caller did not name', async () => {
    // A reset unlocks exactly one path. Everything else in the same document is judged by the
    // usual rule, so a reset is never a blanket permission to write junk.
    seedTenant(
      await storedConfig((c) => {
        c.configuration.general.theme = 7;
      })
    );

    await TenantService.applyConfigDocument(
      'alice',
      {
        version: 1,
        configuration: { general: { theme: 'dark', styleTemplate: 99 } },
      },
      ['configuration.general.theme']
    );

    expect(saved.configuration.general.theme).toBe('dark');
    expect(saved.configuration.general.styleTemplate).toBe('medium');
  });
});

/**
 * The reset has to know which side of the save is the broken one. Asking only whether the
 * stored and incoming values disagree cannot tell: that question is symmetric, so it answers
 * yes just as readily when the stored value is healthy and the replacement is junk, and the
 * repair tool becomes the easiest way to corrupt a good field. The canonical shape for the
 * path is what breaks the symmetry.
 */
describe('a reset cannot corrupt a healthy value', () => {
  it('refuses to put a number over a healthy string', async () => {
    seedTenant(await storedConfig());

    const { discarded, reset } = await TenantService.applyConfigDocument(
      'alice',
      { version: 1, configuration: { general: { theme: 42 } } },
      ['configuration.general.theme']
    );

    expect(saved.configuration.general.theme).toBe('system');
    expect(reset).toEqual([]);
    expect(discarded).toContainEqual({
      path: 'configuration.general.theme',
      reason: 'the value being saved is not the type this setting must have',
    });
  });

  it('refuses to put the string "false" over a healthy boolean', async () => {
    seedTenant(await storedConfig());

    const { reset } = await TenantService.applyConfigDocument(
      'alice',
      instanceDoc({ features: { likes: { enabled: 'false' } } }),
      ['configuration.instanceConfiguration.features.likes.enabled']
    );

    expect(saved.configuration.instanceConfiguration.features.likes.enabled).toBe(true);
    expect(reset).toEqual([]);
  });

  it('refuses array elements of the wrong type over a healthy array', async () => {
    seedTenant(await storedConfig());

    const { reset } = await TenantService.applyConfigDocument(
      'alice',
      instanceDoc({ features: { auth: { methods: [1, 2] } } }),
      ['configuration.instanceConfiguration.features.auth.methods']
    );

    expect(saved.configuration.instanceConfiguration.features.auth.methods).toEqual([
      'keychain',
      'hivesigner',
      'hiveauth',
    ]);
    expect(reset).toEqual([]);
  });

  it('refuses junk inside a replacement block, even repairing a broken one', async () => {
    // The stored side really is broken here, so the only thing standing between the reset and
    // a stored `readerLayer: 42` is checking the replacement against the canonical block.
    seedTenant(
      await storedConfig((c) => {
        c.configuration.instanceConfiguration.features.hive = 'full';
      })
    );

    const { reset } = await TenantService.applyConfigDocument(
      'alice',
      instanceDoc({ features: { hive: { readerLayer: 42 } } }),
      ['configuration.instanceConfiguration.features.hive']
    );

    expect(saved.configuration.instanceConfiguration.features.hive).toBe('full');
    expect(reset).toEqual([]);
  });

  it('still accepts a block carrying a setting newer than the seed', async () => {
    // The editor offers more of the Hive block than getDefaultConfig writes. A key the seed
    // does not carry contradicts nothing, and a normal save may already write it into an
    // absent slot, so refusing it would block the repair without protecting anything.
    seedTenant(
      await storedConfig((c) => {
        c.configuration.instanceConfiguration.features.hive = 'full';
      })
    );

    const { reset } = await TenantService.applyConfigDocument(
      'alice',
      instanceDoc({
        features: {
          hive: { readerLayer: 'standard', authorRewards: 'author', payoutLabel: 'Earned' },
        },
      }),
      ['configuration.instanceConfiguration.features.hive']
    );

    expect(saved.configuration.instanceConfiguration.features.hive).toEqual({
      readerLayer: 'standard',
      authorRewards: 'author',
      payoutLabel: 'Earned',
    });
    expect(reset).toEqual(['configuration.instanceConfiguration.features.hive']);
  });

  it('refuses a setting the server has no default for', async () => {
    // Nothing says what this field is supposed to be, so nothing can say which side is broken.
    // Refusing leaves it stuck for an operator; guessing would let anything overwrite anything.
    seedTenant(
      await storedConfig((c) => {
        c.configuration.instanceConfiguration.features.tipping = { buttonLabel: 42 };
      })
    );

    const { discarded, reset } = await TenantService.applyConfigDocument(
      'alice',
      instanceDoc({ features: { tipping: { buttonLabel: 'Tip' } } }),
      ['configuration.instanceConfiguration.features.tipping.buttonLabel']
    );

    expect(saved.configuration.instanceConfiguration.features.tipping.buttonLabel).toBe(42);
    expect(reset).toEqual([]);
    expect(discarded).toContainEqual({
      path: 'configuration.instanceConfiguration.features.tipping.buttonLabel',
      reason: 'the server has no default for this setting, so it cannot judge a replacement',
    });
  });
});

describe('a reset cannot remove a pinned identity field', () => {
  it.each(PINNED_INSTANCE_FIELDS)('refuses to reset %s', async (field) => {
    seedTenant(await storedConfig());
    const before = (await storedConfig()).configuration.instanceConfiguration[field];

    const { discarded, reset } = await TenantService.applyConfigDocument(
      'alice',
      instanceDoc({ [field]: 'attacker' }),
      [`configuration.instanceConfiguration.${field}`]
    );

    expect(saved.configuration.instanceConfiguration[field]).toBe(before);
    expect(reset).toEqual([]);
    // Sanitize also reports its own pin for the value in the document, so the reset refusal
    // has to be matched on its reason, not just on the path.
    expect(discarded).toContainEqual({
      path: `configuration.instanceConfiguration.${field}`,
      reason: 'this field is set by the server and cannot be reset',
    });
  });

  it('keeps the pin even when the reset names a path below it', async () => {
    seedTenant(await storedConfig());

    const { discarded, reset } = await TenantService.applyConfigDocument(
      'alice',
      instanceDoc({ type: { nested: 'community' } }),
      ['configuration.instanceConfiguration.type.nested']
    );

    expect(saved.configuration.instanceConfiguration.type).toBe('blog');
    expect(reset).toEqual([]);
    expect(discarded).toContainEqual({
      path: 'configuration.instanceConfiguration.type.nested',
      reason: 'this field is set by the server and cannot be reset',
    });
  });
});

describe('a reset cannot wipe configuration', () => {
  it('refuses to clear a section that holds values', async () => {
    seedTenant(await storedConfig());

    const { discarded, reset } = await TenantService.applyConfigDocument(
      'alice',
      { version: 1, configuration: { general: { theme: 'dark' } } },
      ['configuration.general']
    );

    expect(saved.configuration.general.imageProxy).toBe('https://i.ecency.com');
    expect(saved.configuration.general.theme).toBe('dark');
    expect(reset).toEqual([]);
    expect(discarded[0]).toMatchObject({
      path: 'configuration.general',
      reason: 'a section cannot be reset, only the individual values inside it',
    });
  });

  it('refuses a path that is not inside the configuration document', async () => {
    seedTenant(await storedConfig());

    const { discarded, reset } = await TenantService.applyConfigDocument(
      'alice',
      { version: 1, configuration: { general: { theme: 'dark' } } },
      ['version', 'configuration', 'general.theme', '', 'configuration.']
    );

    expect(reset).toEqual([]);
    expect(discarded).toHaveLength(5);
    for (const entry of discarded) {
      expect(entry.reason).toBe('not a value inside the configuration document');
    }
    expect(saved.version).toBe(1);
  });

  it('refuses prototype and index segments', async () => {
    seedTenant(await storedConfig());

    const { discarded, reset } = await TenantService.applyConfigDocument(
      'alice',
      { version: 1, configuration: { general: { theme: 'dark' } } },
      [
        'configuration.__proto__',
        'configuration.constructor.prototype',
        'configuration.general.__proto__.polluted',
        'configuration.instanceConfiguration.features.postsFilters.0',
      ]
    );

    expect(reset).toEqual([]);
    expect(discarded).toHaveLength(4);
    // Refused on the shape of the path, before anything walks the config with it: not because
    // the walk happens to find nothing there.
    for (const entry of discarded) {
      expect(entry.reason).toBe('not a value inside the configuration document');
    }
    expect(({} as any).polluted).toBeUndefined();
  });

  it('refuses a reset the saved document carries no replacement for', async () => {
    // Without this a reset would be a delete, and the served config would be left with a hole
    // that nothing in the request fills.
    seedTenant(
      await storedConfig((c) => {
        c.configuration.general.theme = 7;
      })
    );

    const { discarded, reset } = await TenantService.applyConfigDocument(
      'alice',
      { version: 1, configuration: { general: { styleTemplate: 'minimal' } } },
      ['configuration.general.theme']
    );

    expect(saved.configuration.general.theme).toBe(7);
    expect(reset).toEqual([]);
    expect(discarded[0]).toMatchObject({
      path: 'configuration.general.theme',
      reason: 'the saved document carries no replacement value for this field',
    });
  });

  it('does not read a null in the document as a request to reset', async () => {
    // Nulls are stripped before the merge (a null section must never erase stored settings), so
    // a document whose field is null carries no replacement and the reset is refused. Only the
    // `reset` list, never a value, can ask for a reset.
    seedTenant(
      await storedConfig((c) => {
        c.configuration.general.theme = 7;
      })
    );

    const { discarded, reset } = await TenantService.applyConfigDocument(
      'alice',
      { version: 1, configuration: { general: { theme: null } } },
      ['configuration.general.theme']
    );

    expect(saved.configuration.general.theme).toBe(7);
    expect(reset).toEqual([]);
    // Refused for carrying no replacement, which is what a stripped null leaves behind.
    expect(discarded).toContainEqual({
      path: 'configuration.general.theme',
      reason: 'the saved document carries no replacement value for this field',
    });
  });

  it('refuses the whole list once it is past the ceiling', async () => {
    seedTenant(
      await storedConfig((c) => {
        c.configuration.general.theme = 7;
      })
    );
    const padding = Array.from({ length: MAX_RESET_PATHS }, (_, i) => `configuration.pad${i}`);

    const { discarded, reset } = await TenantService.applyConfigDocument(
      'alice',
      { version: 1, configuration: { general: { theme: 'dark' } } },
      [...padding, 'configuration.general.theme']
    );

    // Not "the first 32 of them": a list this long is not a field-by-field repair, so none of
    // it is applied and the caller is told why.
    expect(reset).toEqual([]);
    expect(saved.configuration.general.theme).toBe(7);
    expect(discarded).toContainEqual({
      path: 'reset',
      reason: 'at most 32 values can be reset in one save',
    });
  });
});

describe('a reset changes nothing about a save that would have worked', () => {
  it('is a no-op on a healthy field, and is not reported as a discard', async () => {
    seedTenant(await storedConfig());

    const { discarded, reset } = await TenantService.applyConfigDocument(
      'alice',
      { version: 1, configuration: { general: { theme: 'dark' } } },
      ['configuration.general.theme']
    );

    expect(saved.configuration.general.theme).toBe('dark');
    // Nothing was cleared because nothing was blocking, and the save applied in full: saying
    // "some values were not applied" here would be a lie the editor shows the owner.
    expect(reset).toEqual([]);
    expect(discarded).toEqual([]);
  });

  it('is a no-op when the key is not stored at all', async () => {
    seedTenant(
      await storedConfig((c) => {
        delete c.configuration.general.theme;
      })
    );

    const { discarded, reset } = await TenantService.applyConfigDocument(
      'alice',
      { version: 1, configuration: { general: { theme: 'dark' } } },
      ['configuration.general.theme']
    );

    expect(saved.configuration.general.theme).toBe('dark');
    expect(reset).toEqual([]);
    expect(discarded).toEqual([]);
  });

  it('stores the same config where the merge would have taken the value anyway', async () => {
    // An empty array is a valid replacement for a stored array of any element type, so this
    // save applies with or without the reset. The reset does fire, because the stored value is
    // genuinely broken, and what it stores is identical either way.
    const doc = instanceDoc({ features: { auth: { methods: [] } } });
    const broken = (c: any) => {
      c.configuration.instanceConfiguration.features.auth.methods = [1, 2];
    };

    seedTenant(await storedConfig(broken));
    await TenantService.applyConfigDocument('alice', doc);
    const withoutReset = JSON.stringify(saved);

    seedTenant(await storedConfig(broken));
    await TenantService.applyConfigDocument('alice', doc, [
      'configuration.instanceConfiguration.features.auth.methods',
    ]);

    expect(saved.configuration.instanceConfiguration.features.auth.methods).toEqual([]);
    expect(JSON.stringify(saved)).toBe(withoutReset);
  });

  it('leaves a save with no reset list byte-identical', async () => {
    const doc = {
      version: 1,
      configuration: {
        general: { theme: 'dark' },
        instanceConfiguration: { meta: { title: 'T' } },
      },
    };

    seedTenant(await storedConfig());
    await TenantService.applyConfigDocument('alice', doc);
    const withoutReset = JSON.stringify(saved);

    seedTenant(await storedConfig());
    await TenantService.applyConfigDocument('alice', doc, []);
    expect(JSON.stringify(saved)).toBe(withoutReset);
  });
});

describe('resetConfigPaths mechanics', () => {
  it('does not mutate the config it was given', async () => {
    const stored = await storedConfig((c) => {
      c.configuration.general.theme = 7;
    });
    const before = JSON.stringify(stored);

    const { config, reset } = TenantService.resetConfigPaths(
      stored,
      ['configuration.general.theme'],
      {
        document: { configuration: { general: { theme: 'dark' } } },
        canonical: await TenantService.getDefaultConfig('alice', 'alice'),
      }
    );

    expect(reset).toEqual(['configuration.general.theme']);
    expect(JSON.stringify(stored)).toBe(before);
    expect('theme' in config.configuration.general).toBe(false);
    // Untouched branches are shared, not copied.
    expect(config.configuration.instanceConfiguration).toBe(
      stored.configuration.instanceConfiguration
    );
  });

  it('never walks a prototype key when checking a replacement against the canonical shape', () => {
    // JSON.parse makes `__proto__` an own key, so a replacement object can carry one even
    // though sanitize strips it before this runs. Refused rather than walked.
    expect(
      TenantService.matchesCanonicalShape(
        { readerLayer: 'standard' },
        JSON.parse('{"readerLayer":"standard","__proto__":{"polluted":true}}')
      )
    ).toBe(false);
    expect(({} as any).polluted).toBeUndefined();
  });

  it('reads own properties only, so an inherited key is not mistaken for stored config', () => {
    const stored = { configuration: { general: {} } };
    // `toString` resolves through the prototype chain; readPath must not see it.
    expect(TenantService.readPath(stored, ['configuration', 'general', 'toString'])).toBeUndefined();
  });

  it('takes no paths as no work', async () => {
    const stored = await storedConfig();
    const result = TenantService.resetConfigPaths(stored, undefined, {
      document: {},
      canonical: {},
    });
    expect(result.config).toBe(stored);
    expect(result.reset).toEqual([]);
  });
});

/**
 * The route validates reset paths at the edge with these two, and the route suite mocks this
 * module and restates them literally. Pinned here so a change to the rule cannot pass while the
 * route tests go on asserting the old one.
 */
describe('the reset request contract', () => {
  it('pins the accepted path shape', () => {
    expect(CONFIG_RESET_PATH.source).toBe('^configuration(\\.[A-Za-z][A-Za-z0-9_-]*)+$');
    expect(MAX_RESET_PATHS).toBe(32);
  });

  it('pins the identity fields a reset may not touch', () => {
    expect([...PINNED_INSTANCE_FIELDS]).toEqual(['username', 'owner', 'type', 'communityId']);
  });
});

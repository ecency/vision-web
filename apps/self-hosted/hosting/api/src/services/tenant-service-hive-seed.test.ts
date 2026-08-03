import { describe, expect, it } from 'vitest';
import { TenantService } from './tenant-service';

/**
 * What a new tenant is created with, and what happens when an older one adopts
 * the block.
 *
 * The seed literal is repeated here rather than imported from the app: this
 * package builds with `rootDir: ./src` and its Docker context is this directory
 * only, so an import reaching outside it fails the image build. The app owns
 * the anti-drift check instead, reading this file's seed off its syntax tree
 * (`src/core/hive-layer-seed.test.ts`).
 *
 * These exercise the pure config builders only, no DB and no RPC.
 */
const SEED = { readerLayer: 'standard', authorRewards: 'author' };

describe('getDefaultConfig seeds the Hive layer', () => {
  it('carries exactly the seeded block', async () => {
    const config = await TenantService.getDefaultConfig('alice');
    const { features } = config.configuration.instanceConfiguration;
    expect(features.hive).toEqual(SEED);
  });

  it('seeds no beneficiary and no reward split, ever', async () => {
    // Ecency taking a silent cut of a paying tenant's post rewards by default
    // would be indefensible, so the seed is pinned to exactly two keys.
    const config = await TenantService.getDefaultConfig('alice');
    expect(
      Object.keys(config.configuration.instanceConfiguration.features.hive),
    ).toEqual(Object.keys(SEED));
  });

  it('offers only scalars, so no field can be frozen by the array guard', () => {
    // isValidArrayReplacement rejects any array element that is an object, and
    // mergeConfigGuarded takes an incoming value verbatim only when nothing is
    // stored, so an array-of-objects field would save once and then be frozen
    // behind a 200 OK forever.
    for (const value of Object.values(SEED)) {
      expect(typeof value).toBe('string');
    }
  });
});

describe('adopting the block on a config written before it existed', () => {
  it('takes the whole object when nothing is stored at that key', () => {
    // The `stored === undefined` lever: this is why an owner on a year-old
    // config can save the block with no server change.
    const stored = {
      configuration: {
        instanceConfiguration: { features: { likes: { enabled: true } } },
      },
    };
    const merged = TenantService.mergeConfigGuarded(stored, {
      configuration: {
        instanceConfiguration: {
          features: { hive: { readerLayer: 'standard' } },
        },
      },
    });

    const features = merged.configuration.instanceConfiguration.features;
    expect(features.hive).toEqual({ readerLayer: 'standard' });
    // and nothing else in the document moved
    expect(features.likes).toEqual({ enabled: true });
  });

  it('accepts a partial write of one field', () => {
    const stored = {
      configuration: { instanceConfiguration: { features: {} } },
    };
    const merged = TenantService.mergeConfigGuarded(stored, {
      configuration: {
        instanceConfiguration: { features: { hive: { readerLayer: 'full' } } },
      },
    });
    expect(merged.configuration.instanceConfiguration.features.hive).toEqual({
      readerLayer: 'full',
    });
  });

  it('stores a scalar at the block, and then refuses every object write', () => {
    // Documented, not blessed. A hand-crafted PATCH can put a bare string here
    // because nothing is stored yet; every later object write is dropped for a
    // type mismatch while the API still answers 200, so the tenant is stuck
    // until the row is repaired by hand. The client resolver's bail is what
    // keeps the site rendering meanwhile, which is why it is load-bearing
    // rather than paranoia and must not be refactored away.
    const stored = {
      configuration: { instanceConfiguration: { features: {} } },
    };
    const withScalar = TenantService.mergeConfigGuarded(stored, {
      configuration: {
        instanceConfiguration: { features: { hive: 'full' } },
      },
    });
    expect(withScalar.configuration.instanceConfiguration.features.hive).toBe(
      'full',
    );

    const repairAttempt = TenantService.mergeConfigGuarded(withScalar, {
      configuration: {
        instanceConfiguration: {
          features: { hive: { readerLayer: 'standard' } },
        },
      },
    });
    expect(
      repairAttempt.configuration.instanceConfiguration.features.hive,
    ).toBe('full');
  });
});

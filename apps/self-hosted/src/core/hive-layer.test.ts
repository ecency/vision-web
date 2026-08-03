import { describe, expect, it } from 'vitest';
import {
  HIVE_LAYER_CONFIG_DEFAULTS,
  HIVE_LAYER_SEED,
  PAYOUT_LABEL_MAX_LENGTH,
  type ResolvedHiveLayer,
  resolveHiveLayer,
} from './hive-layer';

/**
 * Imported by relative path, not through `@/core`. The barrel pulls in
 * `configuration-loader`, which imports the build-time `config.json` that is
 * generated at image build and does not exist in CI.
 */

function resolve(
  hive: unknown,
  overrides: { isCommunityMode?: boolean; composerIsInternal?: boolean } = {},
): ResolvedHiveLayer {
  return resolveHiveLayer({
    features: hive === undefined ? {} : { hive },
    isCommunityMode: overrides.isCommunityMode ?? false,
    composerIsInternal: overrides.composerIsInternal ?? true,
  });
}

/** Every render decision the posture expands to, as one comparable record. */
function posture(resolved: ResolvedHiveLayer) {
  return {
    payoutOnPost: resolved.showPayoutOnPost,
    payoutInFeed: resolved.showPayoutInFeed,
    chainNote: resolved.showChainNote,
    chainPermalink: resolved.showChainPermalink,
    voteWeightPicker: resolved.showVoteWeightPicker,
    downvotes: resolved.allowDownvotes,
  };
}

const OFF = {
  payoutOnPost: false,
  payoutInFeed: false,
  chainNote: false,
  chainPermalink: false,
  voteWeightPicker: false,
  downvotes: false,
};

const STANDARD = {
  payoutOnPost: true,
  payoutInFeed: false,
  chainNote: true,
  chainPermalink: true,
  voteWeightPicker: false,
  downvotes: false,
};

const FULL_BLOG = {
  payoutOnPost: true,
  payoutInFeed: true,
  chainNote: true,
  chainPermalink: true,
  voteWeightPicker: true,
  downvotes: false,
};

const FULL_COMMUNITY = { ...FULL_BLOG, downvotes: true };

describe('resolveHiveLayer: the posture table', () => {
  it('expands each posture on a blog instance', () => {
    expect(posture(resolve({ readerLayer: 'off' }))).toEqual(OFF);
    expect(posture(resolve({ readerLayer: 'standard' }))).toEqual(STANDARD);
    expect(posture(resolve({ readerLayer: 'full' }))).toEqual(FULL_BLOG);
  });

  it('expands each posture on a community instance', () => {
    const community = { isCommunityMode: true };
    expect(posture(resolve({ readerLayer: 'off' }, community))).toEqual(OFF);
    expect(posture(resolve({ readerLayer: 'standard' }, community))).toEqual(
      STANDARD,
    );
    expect(posture(resolve({ readerLayer: 'full' }, community))).toEqual(
      FULL_COMMUNITY,
    );
  });

  it('reports the posture it resolved', () => {
    expect(resolve({ readerLayer: 'standard' }).readerLayer).toBe('standard');
    expect(resolve({ readerLayer: 'nonsense' }).readerLayer).toBe('off');
  });
});

describe('resolveHiveLayer: absence and malformed documents', () => {
  /**
   * The safety property for the instances already on disk: none of them carries
   * this block, and none of them may change when this ships.
   */
  it.each([
    ['features.hive absent', undefined],
    ['a bare string', 'full'],
    ['an array', []],
    ['null', null],
    ['a number', 42],
    ['readerLayer as a number', { readerLayer: 42 }],
    ['readerLayer in the wrong case', { readerLayer: 'FULL' }],
    ['readerLayer as a boolean', { readerLayer: true }],
    ['an empty block', {}],
  ])('resolves the off posture for %s', (_label, hive) => {
    expect(posture(resolve(hive))).toEqual(OFF);
  });

  it('never reads a block off an array, whatever the array carries', () => {
    // A plain `[]` resolves to the off posture whether or not the array check
    // is there, because it has no keys either way, so the rule "an array is not
    // a block" is only actually exercised by an array that does carry them.
    // Not producible from JSON; asserted so the check cannot be deleted as
    // unreachable and then be missing the day some other path produces one.
    const arrayBlock = Object.assign(['full'], {
      readerLayer: 'full',
      authorRewards: 'author',
      payoutLabel: 'Rewards',
      learnMoreUrl: 'https://example.com',
    });
    expect(posture(resolve(arrayBlock))).toEqual(OFF);
    expect(resolve(arrayBlock).authorRewards).toBe('off');
    expect(resolve(arrayBlock).payoutLabel).toBeNull();
    expect(resolve(arrayBlock).learnMoreUrl).toBeNull();

    const arrayFeatures = Object.assign([], { hive: { readerLayer: 'full' } });
    expect(
      posture(
        resolveHiveLayer({
          features: arrayFeatures,
          isCommunityMode: true,
          composerIsInternal: true,
        }),
      ),
    ).toEqual(OFF);
  });

  it('resolves the off posture when features itself is not an object', () => {
    for (const features of [undefined, null, 'features', [], 7]) {
      expect(
        posture(
          resolveHiveLayer({
            features,
            isCommunityMode: true,
            composerIsInternal: true,
          }),
        ),
      ).toEqual(OFF);
    }
  });

  it('never enables downvotes outside community mode', () => {
    for (const readerLayer of ['off', 'standard', 'full', 'FULL', 42]) {
      expect(
        resolve({ readerLayer }, { isCommunityMode: false }).allowDownvotes,
      ).toBe(false);
    }
  });
});

describe('resolveHiveLayer: authorRewards', () => {
  it('resolves the two literals', () => {
    expect(resolve({ authorRewards: 'author' }).authorRewards).toBe('author');
    expect(resolve({ authorRewards: 'off' }).authorRewards).toBe('off');
  });

  it.each([[true], [1], ['AUTHOR'], [null], [undefined], [{}]])(
    'resolves off for %p',
    (authorRewards) => {
      expect(resolve({ authorRewards }).authorRewards).toBe('off');
    },
  );

  it('is forced off when the composer is external', () => {
    expect(
      resolve({ authorRewards: 'author' }, { composerIsInternal: false })
        .authorRewards,
    ).toBe('off');
  });

  it('is independent of the reader posture', () => {
    expect(resolve({ readerLayer: 'full' }).authorRewards).toBe('off');
    expect(
      resolve({ readerLayer: 'off', authorRewards: 'author' }).authorRewards,
    ).toBe('author');
  });
});

describe('resolveHiveLayer: payoutLabel', () => {
  it('uses the owner value when it is a non-blank string', () => {
    expect(resolve({ payoutLabel: 'Tips from readers' }).payoutLabel).toBe(
      'Tips from readers',
    );
    expect(resolve({ payoutLabel: '  Rewards  ' }).payoutLabel).toBe('Rewards');
  });

  it.each([[5], [''], ['   '], [true], [null], [[]], [{}], [undefined]])(
    'falls back to the built-in label for %p',
    (payoutLabel) => {
      expect(resolve({ payoutLabel }).payoutLabel).toBeNull();
    },
  );

  it('cuts an over-long label at render rather than storing a correction', () => {
    const long = 'r'.repeat(200);
    expect(resolve({ payoutLabel: long }).payoutLabel).toHaveLength(
      PAYOUT_LABEL_MAX_LENGTH,
    );
  });
});

describe('resolveHiveLayer: learnMoreUrl', () => {
  it('accepts an absolute http(s) destination and re-serialises it', () => {
    expect(
      resolve({ learnMoreUrl: 'https://example.com/a' }).learnMoreUrl,
    ).toBe('https://example.com/a');
    expect(resolve({ learnMoreUrl: 'http://example.com' }).learnMoreUrl).toBe(
      'http://example.com/',
    );
  });

  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,x'],
    ['/about'],
    ['about'],
    [''],
    ['   '],
    [42],
    [true],
    [null],
    [undefined],
    [['https://example.com']],
  ])('renders as plain text with no anchor for %p', (learnMoreUrl) => {
    expect(resolve({ learnMoreUrl }).learnMoreUrl).toBeNull();
  });
});

describe('the config surface stays writable', () => {
  /**
   * Every leaf offered under `features.hive` must be a scalar.
   *
   * `isValidArrayReplacement` in the hosting API rejects any array element where
   * `typeof item === 'object'`, and `mergeConfigGuarded` takes an incoming value
   * verbatim only when the stored value is absent. So an array-of-objects field
   * would save exactly once and then be silently frozen behind a 200 OK, with
   * the editor reporting "Saved!" over a discard. A `number` field is barred for
   * the sibling reason: the editor's number input sends `null` when cleared.
   *
   * Scoped to the CONFIG defaults table, not to the resolved object: the
   * resolved object deliberately carries `string | null` for the two optional
   * strings, and nothing there is ever written back to a config document.
   */
  it('offers only scalars, and no number, under features.hive', () => {
    for (const [key, value] of Object.entries(HIVE_LAYER_CONFIG_DEFAULTS)) {
      expect(
        ['string', 'boolean'],
        `features.hive.${key} must be a select or a string`,
      ).toContain(typeof value);
    }
  });

  it('seeds a new instance with values the resolver accepts', () => {
    const seeded = resolveHiveLayer({
      features: { hive: HIVE_LAYER_SEED },
      isCommunityMode: false,
      composerIsInternal: true,
    });
    expect(seeded.readerLayer).toBe('standard');
    expect(seeded.authorRewards).toBe('author');
    expect(posture(seeded)).toEqual(STANDARD);
  });

  it('seeds only keys the defaults table declares', () => {
    for (const key of Object.keys(HIVE_LAYER_SEED)) {
      expect(Object.keys(HIVE_LAYER_CONFIG_DEFAULTS)).toContain(key);
    }
  });
});

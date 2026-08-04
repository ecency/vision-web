import { describe, expect, it } from 'vitest';
import {
  DECLINED_MAX_ACCEPTED_PAYOUT,
  DEFAULT_PERCENT_HBD,
  HIVE_LAYER_CONFIG_DEFAULTS,
  HIVE_LAYER_SEED,
  PAYOUT_LABEL_MAX_LENGTH,
  type ResolvedHiveLayer,
  resolveCommentOptions,
  resolveHiveLayer,
  resolveRewardType,
  UNLIMITED_MAX_ACCEPTED_PAYOUT,
} from './hive-layer';

/**
 * Imported by relative path, not through `@/core`. The barrel pulls in
 * `configuration-loader`, which imports the build-time `config.json` that is
 * generated at image build and does not exist in CI.
 */

function resolve(
  hive: unknown,
  overrides: { composerIsInternal?: boolean } = {},
): ResolvedHiveLayer {
  return resolveHiveLayer({
    features: hive === undefined ? {} : { hive },
    composerIsInternal: overrides.composerIsInternal ?? true,
  });
}

/**
 * Every render decision the posture expands to, as one comparable record.
 *
 * Built by reading the booleans off the resolved object rather than by naming
 * them, so a flag added to `ResolvedHiveLayer` without a row in these tables
 * fails here instead of shipping unasserted.
 */
function posture(resolved: ResolvedHiveLayer): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(resolved).filter(([, value]) => typeof value === 'boolean'),
  ) as Record<string, boolean>;
}

const OFF = {
  showPayoutOnPost: false,
  showPayoutInFeed: false,
  showChainNote: false,
  showChainPermalink: false,
};

const STANDARD = {
  showPayoutOnPost: true,
  showPayoutInFeed: false,
  showChainNote: true,
  showChainPermalink: true,
};

const FULL = {
  showPayoutOnPost: true,
  showPayoutInFeed: true,
  showChainNote: true,
  showChainPermalink: true,
};

describe('resolveHiveLayer: the posture table', () => {
  it('expands each posture', () => {
    expect(posture(resolve({ readerLayer: 'off' }))).toEqual(OFF);
    expect(posture(resolve({ readerLayer: 'standard' }))).toEqual(STANDARD);
    expect(posture(resolve({ readerLayer: 'full' }))).toEqual(FULL);
  });

  it('makes full differ from standard, on exactly one surface', () => {
    // The finding this pins: three postures were offered and two shipped,
    // because the flags that separated full from standard had no consumer.
    // Whatever full adds must be something a component reads; the companion
    // test in hive-layer-consumers.test.ts is what checks that end.
    const standard = posture(resolve({ readerLayer: 'standard' }));
    const full = posture(resolve({ readerLayer: 'full' }));

    const added = Object.keys(full).filter(
      (flag) => full[flag] && !standard[flag],
    );
    const removed = Object.keys(full).filter(
      (flag) => standard[flag] && !full[flag],
    );

    expect(added).toEqual(['showPayoutInFeed']);
    expect(removed).toEqual([]);
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
            composerIsInternal: true,
          }),
        ),
      ).toEqual(OFF);
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

describe("what the author's reward choice puts on chain", () => {
  /**
   * The governing rule, at the one place in this app that can break it: a
   * deploy may change what a visitor sees, it may never change what gets
   * signed. `undefined` here is not a null object, it is the absence of a
   * second operation, and `use-comment.ts` gates on exactly that.
   */
  it('emits no operation at all for the untouched selection', () => {
    expect(resolveCommentOptions('default')).toBeUndefined();
  });

  it('emits nothing for a selection it does not recognise', () => {
    // The value is read back out of a draft in localStorage, which any visitor
    // can edit and which outlives the release that wrote it. Unknown resolves
    // toward the operation that is never broadcast, never toward one that is.
    for (const selection of [
      'sp ',
      'SP',
      'decline',
      '',
      undefined,
      null,
      42,
      true,
      { rewardType: 'dp' },
      ['dp'],
    ]) {
      expect(
        resolveCommentOptions(selection as never),
        String(JSON.stringify(selection)),
      ).toBeUndefined();
      expect(resolveRewardType(selection)).toBe('default');
    }
  });

  it('recognises exactly the three drafts-API selections', () => {
    for (const selection of ['default', 'sp', 'dp'] as const) {
      expect(resolveRewardType(selection)).toBe(selection);
    }
  });

  it('writes every field explicitly for a full power up', () => {
    // percentHbd 0 is the choice. Everything else is written out rather than
    // left to the SDK's destructuring defaults, which would otherwise supply
    // values across a package boundary that no one here reviewed and that no
    // edit can reach once they are on chain.
    expect(resolveCommentOptions('sp')).toEqual({
      maxAcceptedPayout: '1000000.000 HBD',
      percentHbd: 0,
      allowVotes: true,
      allowCurationRewards: true,
      beneficiaries: [],
    });
  });

  it('writes every field explicitly for declined rewards', () => {
    expect(resolveCommentOptions('dp')).toEqual({
      maxAcceptedPayout: '0.000 HBD',
      percentHbd: 10000,
      allowVotes: true,
      allowCurationRewards: true,
      beneficiaries: [],
    });
  });

  it('never seeds a beneficiary', () => {
    // Beneficiaries rewrite who gets paid. Nothing in this app may set one on
    // an author's behalf, so "we ship none" is asserted on the emitted object
    // rather than left as an absence somebody could later fill in.
    for (const selection of ['default', 'sp', 'dp'] as const) {
      expect(resolveCommentOptions(selection)?.beneficiaries ?? []).toEqual([]);
    }
  });

  it('leaves votes and curation alone in every selection it emits', () => {
    // Neither is offered as a choice anywhere in this app, so both must be the
    // chain's own default in anything we broadcast. A false here would disable
    // voting on a post permanently.
    for (const selection of ['sp', 'dp'] as const) {
      const options = resolveCommentOptions(selection);
      expect(options?.allowVotes, selection).toBe(true);
      expect(options?.allowCurationRewards, selection).toBe(true);
    }
  });

  it('declines by capping the payout, and powers up without capping it', () => {
    // The two selections must not bleed into each other: a power-up that also
    // capped the payout would silently decline the rewards it was asked to
    // convert.
    expect(resolveCommentOptions('sp')?.maxAcceptedPayout).toBe(
      UNLIMITED_MAX_ACCEPTED_PAYOUT,
    );
    expect(resolveCommentOptions('dp')?.maxAcceptedPayout).toBe(
      DECLINED_MAX_ACCEPTED_PAYOUT,
    );
    expect(resolveCommentOptions('dp')?.percentHbd).toBe(DEFAULT_PERCENT_HBD);
  });

  it('reads no config value at all', () => {
    // The composer control is per post and per author. If an instance could
    // reach this function, a deploy could change what an author signs, which
    // is the one thing this layer may never do.
    const from = (features: unknown) =>
      resolveHiveLayer({ features, composerIsInternal: true });
    expect(from({ hive: { authorRewards: 'author' } }).authorRewards).toBe(
      'author',
    );
    // Nothing in the resolved layer carries a reward split, a payout cap or a
    // beneficiary for the composer to inherit.
    const resolved = resolveHiveLayer({
      features: { hive: HIVE_LAYER_SEED },
      composerIsInternal: true,
    });
    for (const key of Object.keys(resolved)) {
      expect(
        ['maxAcceptedPayout', 'percentHbd', 'beneficiaries', 'rewardType'],
      ).not.toContain(key);
    }
  });
});

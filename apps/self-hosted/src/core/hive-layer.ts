/**
 * How much of the Hive blockchain this instance shows a reader.
 *
 * One posture select, `features.hive.readerLayer`, expands here into every
 * downstream render decision. Kept pure and handed the raw `features` object
 * rather than reading config itself, following `resolveHivesignerClientId`: the
 * rule lives in one place and is testable without the config module.
 *
 * The governing rule for the whole Hive-native layer: a deploy may change what a
 * visitor sees, it may never change what gets signed. Nothing in this module
 * contributes to a broadcast payload. The composer-side counterpart
 * (`authorRewards`) is resolved here so the posture lives in one place, but it
 * only decides whether the composer offers the author a control; the reward
 * controls themselves, and the `comment_options` operation they would produce,
 * are not part of this layer yet.
 *
 * Every read is defensive. `mergeConfigGuarded` on the hosting API only checks
 * `typeof`, so a hand-crafted PATCH can store any type-compatible value at any
 * of these paths, and the served document reaches the client unvalidated. An
 * unknown value therefore always resolves toward LESS, never more.
 */

export type ReaderLayer = 'off' | 'standard' | 'full';
export type AuthorRewards = 'off' | 'author';

export interface ResolvedHiveLayer {
  readerLayer: ReaderLayer;
  /** Payout figure in the post page meta row. */
  showPayoutOnPost: boolean;
  /** Payout figure in the feed card meta row. */
  showPayoutInFeed: boolean;
  /** "Published on Hive" note, optionally linked to `learnMoreUrl`. */
  showChainNote: boolean;
  /** "View this post on Hive" permalink to the chain record. */
  showChainPermalink: boolean;
  /** Reader picks how strongly their vote lands. */
  showVoteWeightPicker: boolean;
  /** Reader may downvote. Community instances only, always. */
  allowDownvotes: boolean;
  authorRewards: AuthorRewards;
  /** Owner's own word for earnings, or null to use the built-in i18n label. */
  payoutLabel: string | null;
  /** Absolute http(s) URL, or null to render the Hive note as plain text. */
  learnMoreUrl: string | null;
}

export interface HiveLayerInput {
  /** Raw `instanceConfiguration.features`, of entirely unknown shape. */
  features: unknown;
  /**
   * Same expression every other consumer uses (`use-instance-config.ts`):
   * `type === 'community' && !!communityId`. Taking the resolved boolean rather
   * than the raw type keeps one definition of "is a community" in the app; a
   * second one would disagree on `type: 'community'` with an empty communityId,
   * where the sidebar already renders the personal branch.
   */
  isCommunityMode: boolean;
  /** `resolveCreatePostTarget(...).kind === 'internal'`. */
  composerIsInternal: boolean;
}

/**
 * What every leaf under `features.hive` resolves to when it is absent, and what
 * the editor must offer as that field's default so the panel cannot display a
 * state the site disagrees with.
 *
 * Deliberately flat and scalar. `isValidArrayReplacement` in the hosting API
 * (`tenant-service.ts`) returns false for any array element where
 * `typeof item === 'object'`, while the merge takes an incoming value verbatim
 * only when the stored value is absent. An array-of-objects field here would
 * therefore save exactly once and then be frozen behind a 200 OK forever. A
 * `number` field is barred for the same class of reason: the editor's number
 * input sends `null` when cleared. Selects and strings only, checked by test.
 */
export const HIVE_LAYER_CONFIG_DEFAULTS = {
  readerLayer: 'off',
  authorRewards: 'off',
  payoutLabel: '',
  learnMoreUrl: '',
} as const;

/**
 * What a NEW instance is created with. Existing instances are untouched:
 * absence resolves to the `off` posture, so this deploy is inert on every
 * config already on disk.
 */
export const HIVE_LAYER_SEED = {
  readerLayer: 'standard',
  authorRewards: 'author',
} as const;

/** An owner-typed label longer than this is cut at render, never stored-corrected. */
export const PAYOUT_LABEL_MAX_LENGTH = 40;

const READER_LAYERS: readonly ReaderLayer[] = ['off', 'standard', 'full'];
const AUTHOR_REWARDS: readonly AuthorRewards[] = ['off', 'author'];

/** A value that can carry keys: not a primitive, not null, not an array. */
function plainObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Exactly one of the allowed literals, or the fallback.
 *
 * No case folding and no trimming: `"FULL"` is not `full`. An owner who cannot
 * produce the literal through the editor produced it by hand, and guessing at
 * their intent is how an unknown value ends up granting more than it names.
 */
function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** The owner's own earnings label, or null to fall back to the built-in one. */
function resolvePayoutLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed.slice(0, PAYOUT_LABEL_MAX_LENGTH);
}

/**
 * An absolute http(s) destination, re-serialised, or null.
 *
 * This value becomes an `href`. Parsing and re-serialising means a
 * `javascript:` or `data:` value cannot reach the DOM and a relative one cannot
 * produce a link that goes nowhere, matching `create-post-target.ts`. Refusing
 * renders the Hive note as plain text, which still reads correctly.
 */
function resolveLearnMoreUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url.href;
}

/**
 * Expand the posture into the render decisions, then apply the clamps.
 *
 * The clamps live here rather than in a component because storage cannot
 * enforce them: everything below is downstream of the merge, at the read site.
 */
export function resolveHiveLayer(input: HiveLayerInput): ResolvedHiveLayer {
  const features = plainObject(input.features);
  // A bare string, an array or a number at `features.hive` means the whole
  // block is absent. It is storable today, so this bail is load-bearing rather
  // than paranoia: without it the site crashes on a value the API accepted.
  const hive = features ? plainObject(features.hive) : null;

  const readerLayer = oneOf(
    hive?.readerLayer,
    READER_LAYERS,
    HIVE_LAYER_CONFIG_DEFAULTS.readerLayer,
  );

  const atLeastStandard = readerLayer === 'standard' || readerLayer === 'full';
  const isFull = readerLayer === 'full';

  return {
    readerLayer,
    showPayoutOnPost: atLeastStandard,
    showPayoutInFeed: isFull,
    // Not separately toggleable. A payout printed without the note that it is
    // not final, or a weight picker whose effect is invisible, are each worse
    // than showing neither.
    showChainNote: atLeastStandard,
    showChainPermalink: atLeastStandard,
    showVoteWeightPicker: isFull,
    // A personal blog owner cannot put a downvote arrow on their own posts, by
    // hand-edited JSON or otherwise.
    allowDownvotes: isFull && input.isCommunityMode,
    // An owner who deliberately points "Create post" at an external composer
    // must not get a panel that configures a composer nobody uses.
    authorRewards: input.composerIsInternal
      ? oneOf(
          hive?.authorRewards,
          AUTHOR_REWARDS,
          HIVE_LAYER_CONFIG_DEFAULTS.authorRewards,
        )
      : 'off',
    payoutLabel: resolvePayoutLabel(hive?.payoutLabel),
    learnMoreUrl: resolveLearnMoreUrl(hive?.learnMoreUrl),
  };
}

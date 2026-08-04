/**
 * How much of the Hive blockchain this instance shows a reader.
 *
 * One posture select, `features.hive.readerLayer`, expands here into every
 * downstream render decision. Kept pure and handed the raw `features` object
 * rather than reading config itself, following `resolveHivesignerClientId`: the
 * rule lives in one place and is testable without the config module.
 *
 * The governing rule for the whole Hive-native layer: a deploy may change what a
 * visitor sees, it may never change what gets signed. `authorRewards` decides
 * only whether the composer offers the author a control. What that control can
 * put on chain is `resolveCommentOptions` at the bottom of this file, and its
 * answer for the untouched selection is `undefined`, which is what keeps the
 * broadcast byte-identical to today for every author who does not choose
 * otherwise. No config value reaches that function.
 *
 * Every read is defensive. `mergeConfigGuarded` on the hosting API only checks
 * `typeof`, so a hand-crafted PATCH can store any type-compatible value at any
 * of these paths, and the served document reaches the client unvalidated. An
 * unknown value therefore always resolves toward LESS, never more.
 *
 * Nothing is resolved here that nothing can render. The reader vote-weight
 * picker and the community downvote arrow are part of the `full` posture in the
 * spec and are deliberately absent from this module: `VoteButton` comes from
 * `@ecency/ui` through a committed `dist`, so a prop added in its source does
 * not reach this app at all until that dist is rebuilt, which house policy keeps
 * out of a feature PR. Resolving flags in that state advertises a posture the
 * app cannot honour, so both return together with the `@ecency/ui` change that
 * gives them a consumer, along with the `isCommunityMode` input the downvote
 * clamp needs. See step 10 of the Hive-native layer spec. A test asserts that
 * every render flag this module resolves is read by a component.
 */

import type { CommentPayload, DraftRewardType } from '@ecency/sdk';

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
  authorRewards: AuthorRewards;
  /** Owner's own word for earnings, or null to use the built-in i18n label. */
  payoutLabel: string | null;
  /** Absolute http(s) URL, or null to render the Hive note as plain text. */
  learnMoreUrl: string | null;
}

export interface HiveLayerInput {
  /** Raw `instanceConfiguration.features`, of entirely unknown shape. */
  features: unknown;
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
    // The one thing `full` does that `standard` does not, so the two postures
    // differ on a surface a reader can see rather than only in this object.
    showPayoutInFeed: isFull,
    // Not separately toggleable. A payout printed without the note that it is
    // not final is worse than showing neither.
    showChainNote: atLeastStandard,
    showChainPermalink: atLeastStandard,
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

/**
 * The author's reward choice for one post, in the drafts API's vocabulary.
 *
 * `DraftRewardType` is reused rather than redeclared so config, composer and
 * the drafts API cannot drift into three spellings of the same three states.
 */
export type RewardType = DraftRewardType;

/**
 * Every field of a `comment_options` operation, with none of them optional.
 *
 * Derived from the SDK's own payload type rather than restated, and wrapped in
 * `Required` on purpose: `use-comment.ts` destructures this object with
 * defaults (`maxAcceptedPayout = "1000000.000 HBD"`, `percentHbd = 10000`,
 * `allowVotes = true`, `allowCurationRewards = true`, `beneficiaries = []`),
 * so any field we leave out is silently filled in across a package boundary by
 * a value we never reviewed and can never edit once it is on chain. `Required`
 * turns that from a rule someone has to remember into a compile error, and it
 * fails loudly if the SDK ever adds a sixth field.
 */
export type ExplicitCommentOptions = Required<
  NonNullable<CommentPayload['options']>
>;

/** Hive's own "no cap", the value a post carries when nothing is set. */
export const UNLIMITED_MAX_ACCEPTED_PAYOUT = '1000000.000 HBD';
/** A cap of zero is how Hive expresses declined rewards. */
export const DECLINED_MAX_ACCEPTED_PAYOUT = '0.000 HBD';
/** 10000 basis points, Hive's own default split. */
export const DEFAULT_PERCENT_HBD = 10000;

const REWARD_TYPES: readonly RewardType[] = ['default', 'sp', 'dp'];

/**
 * One of the three reward selections, or `default` for anything else.
 *
 * The stored value comes from the draft in localStorage, which any visitor can
 * edit and which outlives the version of the app that wrote it. Unknown
 * resolves to `default`, and `default` emits nothing, so a corrupted draft
 * cannot broadcast an operation the author never chose.
 */
export function resolveRewardType(value: unknown): RewardType {
  return oneOf(value, REWARD_TYPES, 'default');
}

/**
 * What the author's selection puts on chain, or `undefined` for none.
 *
 * `undefined` is the whole safety property of this track: `use-comment.ts`
 * gates the second operation on `if (payload.options)`, so an absent or
 * undefined value produces an operation array byte-identical to the one this
 * app broadcasts today. That is why the untouched selection returns nothing at
 * all rather than an object spelling out Hive's defaults: an emitted
 * `comment_options` operation is on chain forever and cannot be edited, and no
 * author asked for one.
 *
 * When something IS emitted, every field is written explicitly. See
 * `ExplicitCommentOptions`.
 *
 * No beneficiary is ever seeded. A beneficiary rewrites who gets paid, and
 * doing that on an author's behalf is not a default anyone may set for them.
 * The empty array is written rather than omitted so that "we ship none" is a
 * value a test can read.
 */
export function resolveCommentOptions(
  selection: RewardType | undefined,
): ExplicitCommentOptions | undefined {
  const rewardType = resolveRewardType(selection);

  if (rewardType === 'default') {
    return undefined;
  }

  return {
    // Declining rewards is a payout cap of zero. Powering up is unchanged pay
    // with none of it in Hive Dollars, so the cap stays at Hive's own no-cap.
    maxAcceptedPayout:
      rewardType === 'dp'
        ? DECLINED_MAX_ACCEPTED_PAYOUT
        : UNLIMITED_MAX_ACCEPTED_PAYOUT,
    percentHbd: rewardType === 'sp' ? 0 : DEFAULT_PERCENT_HBD,
    allowVotes: true,
    allowCurationRewards: true,
    beneficiaries: [],
  };
}

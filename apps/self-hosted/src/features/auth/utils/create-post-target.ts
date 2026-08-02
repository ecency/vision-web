/**
 * Where the "Create post" button sends the author.
 *
 * The built-in composer at /publish is the default for every instance type. A
 * blog owner writes on their own domain instead of being handed off to another
 * site. `general.createPostUrl` remains an escape hatch for an owner who has
 * deliberately pointed the button at an external composer.
 */

/** The built-in composer route. */
export const INTERNAL_PUBLISH_ROUTE = '/publish';

/**
 * Values that mean "nobody chose this", even though they are present in the
 * stored config.
 *
 * Managed hosting wrote `https://ecency.com/publish` into every tenant's config
 * at signup, back when personal blogs had no built-in composer. It is a default,
 * not a decision: every live tenant carries it and none carries anything else.
 * Reading it as a configured external composer would pin all of them to the old
 * hand-off, so the new default would reach nobody. The http and www spellings
 * are included because they say the same thing.
 *
 * Compared after `normalize`, so entries here are lowercase and carry no
 * trailing slash.
 */
const LEGACY_EXTERNAL_DEFAULTS = new Set([
  'https://ecency.com/publish',
  'http://ecency.com/publish',
  'https://www.ecency.com/publish',
  'http://www.ecency.com/publish',
]);

export type CreatePostTarget =
  /** Use the built-in editor on this instance. */
  | { kind: 'internal' }
  /** Hand off to the owner's configured composer. */
  | { kind: 'external'; href: string };

export interface CreatePostTargetInput {
  /** Raw `general.createPostUrl` from the instance config. */
  createPostUrl: string | null | undefined;
  /** True when this instance is a community instance with a community id. */
  isCommunityMode: boolean;
}

/** Fold away the differences that do not change which composer is meant. */
function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\/+$/, '');
}

/**
 * Resolve the destination of the "Create post" button.
 *
 * Community instances always use the built-in editor: it is what carries the
 * community target (parentPermlink = communityId), and an external composer
 * would lose it and publish to the member's own blog instead. `createPostUrl`
 * is therefore not honoured there.
 *
 * On a blog instance an absent, blank, legacy-default or self-referential value
 * all mean the built-in editor. Anything else is the owner's own choice and is
 * honoured as-is, only trimmed so surrounding whitespace cannot break the href.
 */
export function resolveCreatePostTarget({
  createPostUrl,
  isCommunityMode,
}: CreatePostTargetInput): CreatePostTarget {
  if (isCommunityMode) {
    return { kind: 'internal' };
  }

  const configured = (createPostUrl ?? '').trim();

  if (!configured) {
    return { kind: 'internal' };
  }

  const normalized = normalize(configured);

  if (normalized === INTERNAL_PUBLISH_ROUTE) {
    return { kind: 'internal' };
  }

  if (LEGACY_EXTERNAL_DEFAULTS.has(normalized)) {
    return { kind: 'internal' };
  }

  return { kind: 'external', href: configured };
}

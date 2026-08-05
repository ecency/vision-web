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
  // hosting/scripts/add-tenant.sh seeded this spelling instead. Same intent,
  // same non-decision, so a tenant provisioned by the script is not stranded on
  // the hand-off either.
  'https://ecency.com/submit',
  'http://ecency.com/submit',
  'https://www.ecency.com/submit',
  'http://www.ecency.com/submit',
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

/**
 * Accept the value as an external destination, or refuse it.
 *
 * This string becomes an href. Parsing it and re-serializing means a
 * `javascript:` or `data:` value cannot reach the DOM, and a relative or
 * unparseable one cannot produce a link that goes nowhere. Refusing falls back
 * to the built-in editor, which is the working destination, rather than
 * rendering a button that does nothing.
 */
function toExternalTarget(value: string): CreatePostTarget | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  return { kind: 'external', href: url.href };
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
 * all mean the built-in editor. Anything else is the owner's own choice, and is
 * honoured only when it is a real http(s) destination.
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

  return toExternalTarget(configured) ?? { kind: 'internal' };
}

/**
 * Whether a configured composer address was REFUSED, as opposed to meaning the
 * built-in editor.
 *
 * `resolveCreatePostTarget` collapses both into `{ kind: 'internal' }`, so a
 * caller outside this module cannot tell an owner who left the field empty
 * from one who typed an address the resolver would not honour. The second is
 * worth saying out loud: they asked for an external composer and silently got
 * the built-in one.
 *
 * Lives here rather than in the config editor because the rule for what counts
 * as a legacy default belongs to this module, and a panel restating it would
 * drift the first time another default is retired.
 */
export function isRefusedCreatePostUrl(value: string): boolean {
  const configured = value.trim();
  if (!configured) return false;

  const normalized = normalize(configured);
  if (normalized === INTERNAL_PUBLISH_ROUTE) return false;
  if (LEGACY_EXTERNAL_DEFAULTS.has(normalized)) return false;

  return toExternalTarget(configured) === null;
}

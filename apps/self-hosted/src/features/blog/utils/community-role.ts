/**
 * Which community roles may see moderator-only figures.
 *
 * `num_pending` is the length of a moderation queue. It has always been printed
 * to every visitor, where it reads as a statistic about the community rather
 * than as work waiting for someone with a button they do not have.
 */
const MODERATOR_ROLES = new Set(['owner', 'admin', 'mod']);

/**
 * True only for a role the app has actually been told about.
 *
 * `getCommunityContextQueryOptions` is disabled without both a username and a
 * community name, so a logged-out visitor gets `undefined` here rather than a
 * role. That is the right answer, but it is the answer by way of a disabled
 * query, so the default is stated explicitly instead of inherited from it.
 */
export function isModeratorRole(role: unknown): boolean {
  return typeof role === 'string' && MODERATOR_ROLES.has(role);
}

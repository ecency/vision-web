/**
 * What kind of instance this is, in one place.
 *
 * "Community" is not simply `type === 'community'`: it also needs a
 * `communityId`, because that id is what every community behaviour is built
 * from. An instance typed community with no id behaves as a blog everywhere,
 * and a definition that ignored the id would disagree with the sidebar.
 *
 * This existed twice before, in `use-instance-config` and `use-hive-layer`, the
 * second carrying a comment saying it was deliberately the same expression as
 * the first. Two copies kept in step by a comment is the drift this module
 * removes; a third was about to be written for the configuration editor, which
 * is what prompted it.
 *
 * Pure and shape-tolerant on purpose: the callers read from a store selector, a
 * resolved instance object and an unvalidated config document respectively, and
 * none of those is guaranteed to hold what its type says at runtime.
 */

/** The two fields the answer depends on, from wherever the caller has them. */
export interface InstanceModeInput {
  type?: unknown;
  communityId?: unknown;
}

export function isCommunityInstance(
  instance: InstanceModeInput | null | undefined,
): boolean {
  if (!instance) return false;
  const communityId =
    typeof instance.communityId === 'string' ? instance.communityId.trim() : '';
  return instance.type === 'community' && communityId !== '';
}

/**
 * The same question asked of a whole config document.
 *
 * The configuration editor holds the document rather than a resolved instance,
 * and the document is unvalidated: any node on the path may be absent or hold
 * something that is not an object, so each step is checked rather than assumed.
 */
export function isCommunityConfig(config: unknown): boolean {
  const node = (value: unknown, key: string): unknown =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)[key]
      : undefined;

  const instance = node(node(config, 'configuration'), 'instanceConfiguration');
  if (!instance || typeof instance !== 'object' || Array.isArray(instance)) {
    return false;
  }
  return isCommunityInstance(instance as InstanceModeInput);
}

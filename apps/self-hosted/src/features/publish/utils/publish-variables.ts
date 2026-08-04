import type { RewardType } from '@/core/hive-layer';

/**
 * Everything that decides what a publish broadcasts.
 *
 * The permlink is derived from the title, the metadata from the tags and the
 * instance's own type, and the reward operation from the selection, so this is
 * the whole input to the payload rather than a summary of it. The publish hook
 * takes exactly this type, so a field added to the payload is added here.
 */
export interface PublishVariables {
  title: string;
  body: string;
  tags: string[];
  rewardType: RewardType;
}

/**
 * A stable identity for one set of publish variables.
 *
 * The publish button asks the author to confirm, and the thing they confirmed
 * has to be the thing that goes out. So the confirmation is granted to this
 * key rather than to the button, and any edit to the draft produces a
 * different key and withdraws it.
 *
 * Derived rather than enumerated. It walks whatever keys the object actually
 * has, at every depth, so a field added to `PublishVariables` is covered
 * without anybody remembering to add it here. Nothing in this function names a
 * field, which is the point: the previous version watched the reward selection
 * only, so an author could confirm one post and publish a different one by
 * editing the title in between.
 *
 * Sorted at every level because key order is not part of what gets broadcast,
 * and two orderings of the same draft must not read as two different drafts.
 *
 * The one thing it cannot see is a value JSON does not represent, a File or a
 * class instance for example. A field like that is a real gap, so the tests
 * below pin the derivation on a nested object and an unknown field, and a new
 * field of that kind needs its own identity here.
 */
export function publishConfirmationKey(variables: PublishVariables): string {
  return JSON.stringify(stableShape(variables));
}

/**
 * Whether a confirmation is currently held for exactly these variables.
 *
 * The rule the publish button arms on, kept here rather than in the component
 * so it can be driven by a test: nothing in this app renders a `.tsx`. A
 * confirmation is not a flag that stays true until something remembers to
 * clear it. It is held for one payload and evaporates the moment the payload
 * differs, which is the only version of "confirm" that cannot approve one post
 * and publish another.
 */
export function isConfirmationHeld(
  armedFor: string | null,
  variables: PublishVariables,
): boolean {
  return armedFor !== null && armedFor === publishConfirmationKey(variables);
}

function stableShape(value: unknown): unknown {
  if (Array.isArray(value)) {
    // Order matters in a tag list, so it is preserved.
    return value.map(stableShape);
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, stableShape(source[key])]),
    );
  }
  return value;
}

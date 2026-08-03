/**
 * When a community membership change may be called done.
 *
 * A subscribe or unsubscribe is a `custom_json` broadcast sent in async mode,
 * which returns as soon as a node accepts it into its mempool. That is not
 * block inclusion, and block inclusion is not Hivemind having indexed it, and
 * `bridge.get_community_context` reads Hivemind. So a read taken immediately
 * after the broadcast resolves almost always still says "not subscribed": the
 * button falls back to "Join", and the reader, reasonably, presses it again and
 * broadcasts a duplicate.
 *
 * The fix is to keep reading the community back on a bounded schedule and to
 * treat only the community's own answer as confirmation. Nothing here writes to
 * the cache: the whole point is that we do not yet know the operation landed,
 * and an optimistic write would be the same lie in a different place.
 */

export interface ConfirmationPolicy {
  /** How many times the community context is read back before giving up. */
  attempts: number;
  /** How long to wait before each read. */
  intervalMs: number;
}

/**
 * Six reads, three seconds apart, so about eighteen seconds.
 *
 * A Hive block is three seconds, so this spans several blocks plus Hivemind's
 * own indexing lag, which covers the normal case comfortably. It is deliberately
 * not longer: past this the honest thing is to say we cannot confirm it rather
 * than to keep a reader watching a spinner.
 */
export const MEMBERSHIP_CONFIRMATION: ConfirmationPolicy = {
  attempts: 6,
  intervalMs: 3000,
};

export type ConfirmationStep =
  /** The community reports the change. Done. */
  | { kind: 'confirmed' }
  /** Not yet, and there is budget left. Wait this long, then read again. */
  | { kind: 'retry'; delayMs: number }
  /** Budget spent without the community agreeing. Say so; do not claim success. */
  | { kind: 'unconfirmed' };

/**
 * What to do after reading the community context back.
 *
 * @param observed  `subscribed` as the community currently reports it, or
 *                  undefined when the read produced nothing.
 * @param desired   what the broadcast was meant to make it.
 * @param attemptsMade how many reads have completed, counting this one from 1.
 */
export function nextConfirmationStep(
  observed: boolean | undefined,
  desired: boolean,
  attemptsMade: number,
  policy: ConfirmationPolicy = MEMBERSHIP_CONFIRMATION,
): ConfirmationStep {
  if (observed === desired) return { kind: 'confirmed' };
  if (attemptsMade >= policy.attempts) return { kind: 'unconfirmed' };
  return { kind: 'retry', delayMs: policy.intervalMs };
}

/** The longest a reader can be left waiting, in milliseconds. */
export function confirmationBudgetMs(
  policy: ConfirmationPolicy = MEMBERSHIP_CONFIRMATION,
): number {
  return policy.attempts * policy.intervalMs;
}

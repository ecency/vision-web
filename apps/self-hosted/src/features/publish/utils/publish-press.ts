/**
 * What one press of the publish button does.
 *
 * The button asks twice when, and only when, the publish would put something on
 * chain that no later edit can reach: a `comment_options` operation carrying
 * the author's reward choice. A post itself can be edited afterwards, so where
 * no such operation is emitted there is nothing a confirmation would protect
 * and the button publishes on the first press, exactly as it did before any of
 * this existed. `needsConfirmation` carries that decision in, computed from the
 * function that builds the operation rather than from the config posture, so
 * the question and the broadcast cannot drift apart.
 *
 * A second press is also the shape of an accidental double click. Broadcasts
 * already retry, and a duplicated publish is a duplicate post on chain that
 * nobody can take back, so the decision to broadcast is made here, from a state
 * a test can drive, rather than inside a component nothing in this app can
 * render.
 *
 * `inFlight` is the part that matters and the part a React state flag cannot
 * do: a `isPending` from the mutation only becomes true after a re-render, so
 * two presses in the same frame can both read it as false. The component holds
 * `inFlight` in a ref it sets before awaiting, which is synchronous, and this
 * function refuses on it. It is the only thing standing between a double click
 * and two posts when `needsConfirmation` is false, which is most publishes.
 * `canPublish` and `isPublishing` are passed through unchanged from what the
 * button already disabled itself on.
 *
 * `armed` is not a flag the component toggles. It is granted to one exact set
 * of publish variables and recomputed on every render, so editing the title,
 * the body, the tags or the reward choice withdraws it with no window in which
 * a confirmation granted for one payload could publish another.
 */

/** One press: do nothing, ask for confirmation, or broadcast. */
export type PublishPress = 'ignore' | 'arm' | 'publish';

export interface PublishPressState {
  /** The draft has a title, a body and at least one tag. */
  canPublish: boolean;
  /** The mutation reports itself pending. Lags a press by one render. */
  isPublishing: boolean;
  /** A broadcast has been started and has not settled. Set synchronously. */
  inFlight: boolean;
  /** This publish would emit an operation that cannot be edited afterwards. */
  needsConfirmation: boolean;
  /** The confirmation currently held is for exactly these variables. */
  armed: boolean;
}

export function nextPublishPress(state: PublishPressState): PublishPress {
  // Nothing to publish, or something is already going out. Both mean the press
  // does nothing at all: not even re-arming, which would leave the button
  // saying "press again" while a broadcast is in the air.
  if (!state.canPublish || state.isPublishing || state.inFlight) {
    return 'ignore';
  }

  // Nothing irreversible is being added, so nothing is asked. An owner who
  // turned the reward control off, or who points "Create post" elsewhere, gets
  // the single press they had before.
  if (!state.needsConfirmation) {
    return 'publish';
  }

  return state.armed ? 'publish' : 'arm';
}

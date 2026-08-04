/**
 * What one press of the publish button does.
 *
 * Publishing is the only irreversible action in this app, so the button asks
 * twice: the first press arms it, the second one broadcasts. That is a second
 * chance to read the reward split, which cannot be edited once it is on chain.
 *
 * It is also the edit most able to do harm, because a second press is exactly
 * the shape of an accidental double click. Broadcasts already retry, and a
 * duplicated publish is a duplicate post on chain that nobody can take back,
 * so the decision to broadcast is made here, from a state a test can drive,
 * rather than inside a component nothing in this app can render.
 *
 * `inFlight` is the part that matters and the part a React state flag cannot
 * do: a `isPending` from the mutation only becomes true after a re-render, so
 * two presses in the same frame can both read it as false. The component holds
 * `inFlight` in a ref it sets before awaiting, which is synchronous, and this
 * function refuses on it. `canPublish` and `isPublishing` are passed through
 * unchanged from what the button already disabled itself on.
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
  /** A previous press armed the button and nothing has disarmed it since. */
  armed: boolean;
}

export function nextPublishPress(state: PublishPressState): PublishPress {
  // Nothing to publish, or something is already going out. Both mean the press
  // does nothing at all: not even re-arming, which would leave the button
  // saying "press again" while a broadcast is in the air.
  if (!state.canPublish || state.isPublishing || state.inFlight) {
    return 'ignore';
  }

  return state.armed ? 'publish' : 'arm';
}

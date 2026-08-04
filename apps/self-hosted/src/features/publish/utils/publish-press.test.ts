import { describe, expect, it } from 'vitest';
import {
  nextPublishPress,
  type PublishPress,
  type PublishPressState,
} from './publish-press';

/**
 * The publish button asks twice, and must broadcast once.
 *
 * A confirm state on the same button is a second press, which is also the
 * shape of an accidental double click. Broadcasts retry on their own and a
 * duplicated publish is a second post on chain that nobody can delete, so
 * "cannot double fire" is driven here as a sequence of presses rather than
 * asserted about the component, which this app cannot render in a test.
 */

/**
 * The button as the component wires it.
 *
 * `armed` is React state and `inFlight` is a ref the handler sets before it
 * awaits. `isPublishing` is the mutation's own flag, which only turns true on
 * the next render, so it is updated here only when `render()` is called. That
 * lag is the reason `inFlight` exists at all.
 */
class PublishButton {
  armed = false;
  inFlight = false;
  isPublishing = false;
  canPublish = true;
  /** How many times a broadcast was actually started. */
  broadcasts = 0;
  readonly log: PublishPress[] = [];

  /**
   * @param flushState whether React has committed `armed` before the next
   *   press is handled. Two clicks inside one frame have not, which is the
   *   friendlier case; a click, a paint and a second click have, which is the
   *   case that could actually double fire.
   */
  constructor(private readonly flushState = true) {}

  private state(): PublishPressState {
    return {
      canPublish: this.canPublish,
      isPublishing: this.isPublishing,
      inFlight: this.inFlight,
      armed: this.armed,
    };
  }

  press(): PublishPress {
    const action = nextPublishPress(this.state());
    this.log.push(action);

    if (action === 'arm' && this.flushState) {
      this.armed = true;
    }

    if (action === 'publish') {
      // Exactly the order the handler uses: the synchronous latch first, then
      // the state, then the await.
      this.inFlight = true;
      this.armed = false;
      this.broadcasts += 1;
    }

    return action;
  }

  /** A render happens: the mutation's pending flag catches up. */
  render(): void {
    this.isPublishing = this.inFlight;
  }

  /** The broadcast settles, successfully or not. */
  settle(): void {
    this.inFlight = false;
    this.isPublishing = false;
  }
}

describe('one publish button, two presses, one broadcast', () => {
  it('arms on the first press and broadcasts on the second', () => {
    const button = new PublishButton();
    expect(button.press()).toBe('arm');
    expect(button.broadcasts).toBe(0);
    expect(button.press()).toBe('publish');
    expect(button.broadcasts).toBe(1);
  });

  it('broadcasts once however fast the button is pressed', () => {
    const button = new PublishButton();
    for (let i = 0; i < 20; i += 1) button.press();
    expect(button.broadcasts).toBe(1);
    expect(button.log.filter((action) => action === 'publish')).toHaveLength(1);
  });

  it('broadcasts nothing on a double click inside one frame', () => {
    // Neither press sees the other's state, so both only ask.
    const button = new PublishButton(false);
    button.press();
    button.press();
    expect(button.broadcasts).toBe(0);
  });

  it('ignores every press while the broadcast is in the air', () => {
    const button = new PublishButton();
    button.press();
    button.press();
    expect(button.broadcasts).toBe(1);

    // Before the mutation's own flag has caught up: this is the window the
    // latch exists for, and the button is not even disabled yet.
    expect(button.isPublishing).toBe(false);
    for (let i = 0; i < 5; i += 1) expect(button.press()).toBe('ignore');

    button.render();
    for (let i = 0; i < 5; i += 1) expect(button.press()).toBe('ignore');
    expect(button.broadcasts).toBe(1);
  });

  it('costs two presses again after a failed publish', () => {
    const button = new PublishButton();
    button.press();
    button.press();
    button.settle();

    // No silent second attempt: the author has to ask, and confirm, again.
    expect(button.press()).toBe('arm');
    expect(button.broadcasts).toBe(1);
    expect(button.press()).toBe('publish');
    expect(button.broadcasts).toBe(2);
  });

  it('does nothing at all on an incomplete draft', () => {
    const button = new PublishButton();
    button.canPublish = false;
    for (let i = 0; i < 5; i += 1) expect(button.press()).toBe('ignore');
    // Not even armed, so completing the draft does not leave a button one
    // press away from broadcasting.
    expect(button.armed).toBe(false);
  });

  it('publishes on exactly one of the sixteen states', () => {
    // The whole truth table, so a later change that widens the publishing
    // condition shows up as a diff here rather than as a duplicate post.
    const publishing: PublishPressState[] = [];
    for (const canPublish of [false, true]) {
      for (const isPublishing of [false, true]) {
        for (const inFlight of [false, true]) {
          for (const armed of [false, true]) {
            const state = { canPublish, isPublishing, inFlight, armed };
            if (nextPublishPress(state) === 'publish') publishing.push(state);
          }
        }
      }
    }

    expect(publishing).toEqual([
      { canPublish: true, isPublishing: false, inFlight: false, armed: true },
    ]);
  });
});

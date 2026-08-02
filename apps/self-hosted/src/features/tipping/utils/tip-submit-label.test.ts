import { describe, expect, it } from 'vitest';
import { getTipSubmitLabelKey } from './tip-submit-label';

describe('getTipSubmitLabelKey', () => {
  it('prompts a logged-out visitor to sign in, whether or not a send is in flight', () => {
    expect(getTipSubmitLabelKey(undefined, false)).toBe('tip_login_to_send');
    // The regression: `username && loading ? sending : send` evaluated the
    // `&&` first, so a logged-out visitor fell into the send branch and the
    // button rendered the prompt and the send label together.
    expect(getTipSubmitLabelKey(undefined, true)).toBe('tip_login_to_send');
    expect(getTipSubmitLabelKey(null, true)).toBe('tip_login_to_send');
    expect(getTipSubmitLabelKey('', true)).toBe('tip_login_to_send');
  });

  it('shows the send label to a signed-in user', () => {
    expect(getTipSubmitLabelKey('alice', false)).toBe('tip_send');
  });

  it('shows the in-flight label while a signed-in user is sending', () => {
    expect(getTipSubmitLabelKey('alice', true)).toBe('tip_sending');
  });

  it('never returns more than one label for a state', () => {
    const states: Array<[string | undefined, boolean]> = [
      [undefined, false],
      [undefined, true],
      ['alice', false],
      ['alice', true],
    ];
    for (const [username, loading] of states) {
      const key = getTipSubmitLabelKey(username, loading);
      expect(['tip_login_to_send', 'tip_sending', 'tip_send']).toContain(key);
    }
  });
});

/**
 * Translation key for the tip dialog's submit button.
 *
 * Returns exactly one key for every state. The button used to render two
 * expressions side by side, and `user?.username && loading ? a : b` binds as
 * `(user?.username && loading) ? a : b`, so a logged-out visitor was shown the
 * sign-in prompt and the send label at once ("Login to send a tipTip").
 */
export type TipSubmitLabelKey =
  | 'tip_login_to_send'
  | 'tip_sending'
  | 'tip_send';

export function getTipSubmitLabelKey(
  username: string | undefined | null,
  loading: boolean,
): TipSubmitLabelKey {
  if (!username) {
    return 'tip_login_to_send';
  }
  return loading ? 'tip_sending' : 'tip_send';
}

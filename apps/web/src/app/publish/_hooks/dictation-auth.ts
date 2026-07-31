export interface DictationAuth {
  username: string;
  token: string;
}

/**
 * The token to use for `username`, or null if we do not have one for *that* user.
 *
 * Tokens are stored with their owner because the backend derives identity from the
 * token, not from any username in the request. After an account switch the previous
 * user's token lingers in state until the new refresh resolves, and firing the
 * pricing query in that window returns the OLD account's free allowance while React
 * Query caches it under the NEW account's key -- so the next user sees a price that
 * was never theirs, and staleTime keeps serving it.
 */
export function tokenForUser(auth: DictationAuth | null, username: string | undefined) {
  if (!auth || !username || auth.username !== username) {
    return null;
  }
  return auth.token;
}

import type { AuthMethod } from '../types';

/**
 * Every login method this app can actually complete.
 *
 * The login page renders a known method or nothing, so a name outside this list
 * is accepted by the config and then does nothing at all. The configuration
 * editor checks entries against this list so a typo is rejected where it is
 * typed instead of disappearing into a saved config.
 */
export const AUTH_METHODS: readonly AuthMethod[] = [
  'keychain',
  'hivesigner',
  'hiveauth',
];

/**
 * The methods a visitor may be offered, from the configured list.
 *
 * Hivesigner is dropped unless the instance has a client id. OAuth rejects a
 * redirect_uri its app has not registered, so without one the button can only
 * send the visitor to an error page with no explanation; hiding it is the
 * intended behaviour, not a fallback. The owner is told about it in the
 * configuration editor, which no reader can open.
 */
export function availableAuthMethods(
  configured: readonly string[] | undefined,
  hivesignerClientId: string | null,
): AuthMethod[] {
  return ((configured ?? []) as AuthMethod[]).filter((method) =>
    method === 'hivesigner' ? hivesignerClientId !== null : true,
  );
}

/**
 * The methods a session can be exchanged for a hosting API token with, and
 * therefore the only ones that can save a configuration change.
 *
 * Saving PATCHes the managed-hosting API, which accepts only its own token.
 * `getHostingToken` mints one from a Hivesigner access token verified server
 * side, or from a login challenge signed by a browser extension or by the
 * HiveAuth wallet.
 *
 * HiveAuth was excluded here on the grounds that it cannot sign an arbitrary
 * buffer. That was half right and the wrong half was load-bearing:
 * `hive-auth-wrapper` has no `broadcast: false` for signing a TRANSACTION,
 * which is a real limit, but `HAS.challenge` is a separate command and signing
 * a challenge is all this exchange ever needed. Corrected in #1356.
 *
 * Kept here rather than inside `hosting-token.ts` because the login page has to
 * know it BEFORE an owner spends a session finding out, and the copy on that
 * page names these methods. `config-saving-capability.test.ts` holds this list
 * to the switch in `hosting-token.ts`, so a method gaining or losing the
 * capability cannot drift away from what the page promises.
 */
export const CONFIG_SAVING_METHODS: readonly AuthMethod[] = [
  'hivesigner',
  'keychain',
  'hiveauth',
];

/** Whether a session of this kind can save a configuration change. */
export function canSaveConfiguration(method: AuthMethod): boolean {
  return CONFIG_SAVING_METHODS.includes(method);
}

/**
 * The order the login page offers the methods in.
 *
 * Ranked by what completes the task the page advertises, which is configuring
 * the site. Ranking by ease of signing in once put HiveAuth first while it
 * could not save at all, so an owner following it signed in, opened the panel,
 * edited, saved, and only then learned they had to log in again with something
 * else.
 *
 * All three can save now (#1356), so that tiebreaker is gone and the ranking
 * falls to the next thing the old rationale already named: whether the method
 * works on the device in the owner's hand. `hivesigner` still leads, since it
 * needs nothing installed on either. `hiveauth` follows it rather than trailing
 * the list, because it is the other one that works on a phone; the wallet IS
 * the phone. `keychain` is a desktop browser extension, so it goes last, which
 * is a statement about where it runs and not about how good it is.
 *
 * `hivesigner` is dropped by `availableAuthMethods` on an instance with no
 * client id, so ranking it first costs such an instance nothing.
 *
 * This orders and deduplicates, it never filters. `availableAuthMethods`
 * already decided what a visitor may be offered, so a method that is not ranked
 * here keeps its configured position at the end rather than vanishing.
 */
const DISPLAY_ORDER: readonly AuthMethod[] = [
  'hivesigner',
  'hiveauth',
  'keychain',
];

export function orderAuthMethods(
  methods: readonly AuthMethod[],
): AuthMethod[] {
  const rank = (method: AuthMethod) => {
    const index = DISPLAY_ORDER.indexOf(method);
    return index === -1 ? DISPLAY_ORDER.length : index;
  };

  // Deduplicated on the way in. The configured list is not validated at
  // runtime, and the page renders one card per entry keyed by the method name,
  // so a config naming a method twice produced two cards under one React key.
  // First occurrence wins, so an unranked duplicate cannot jump its position.
  const seen = new Set<AuthMethod>();
  const unique: AuthMethod[] = [];
  for (const method of methods) {
    if (seen.has(method)) continue;
    seen.add(method);
    unique.push(method);
  }

  // Sorted on an explicit original index rather than relying on the runtime's
  // sort being stable, so unranked methods keep the order the owner configured.
  return unique
    .map((method, index) => ({ method, index }))
    .sort((a, b) => rank(a.method) - rank(b.method) || a.index - b.index)
    .map((entry) => entry.method);
}

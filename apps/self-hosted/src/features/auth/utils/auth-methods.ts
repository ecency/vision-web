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
 * side, or from a login challenge signed offline by a browser extension. A
 * HiveAuth session can broadcast to the chain, so it votes, comments and
 * publishes, but it cannot sign an arbitrary buffer: `hive-auth-wrapper`
 * exposes no `broadcast: false` mode, so there is no way to answer the
 * challenge at all. Every other session reaches `getHostingToken`'s `default`
 * and throws.
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
];

/** Whether a session of this kind can save a configuration change. */
export function canSaveConfiguration(method: AuthMethod): boolean {
  return CONFIG_SAVING_METHODS.includes(method);
}

/**
 * The order the login page offers the methods in.
 *
 * Ranked by what completes the task the page advertises, which is configuring
 * the site. Ranking by ease of signing in put HiveAuth first, and HiveAuth is
 * the one method that cannot save anything: an owner following it signed in,
 * opened the panel, edited, saved, and only then learned they had to log in
 * again with something else. Promoting a method that cannot finish is worse
 * than saying nothing.
 *
 * So both saving methods lead, and `hivesigner` leads them, because it is the
 * only one that both saves and works on a phone. It is dropped by
 * `availableAuthMethods` on an instance with no client id, which is every
 * seeded instance today, so ranking it first costs a stock instance nothing and
 * is already correct for an instance that sets one.
 *
 * `hiveauth` last is not a demotion of the reader path: a reader only needs to
 * vote and comment, which it does, and it is still on the page.
 *
 * This orders and deduplicates, it never filters. `availableAuthMethods`
 * already decided what a visitor may be offered, so a method that is not ranked
 * here keeps its configured position at the end rather than vanishing.
 */
const DISPLAY_ORDER: readonly AuthMethod[] = [
  'hivesigner',
  'keychain',
  'hiveauth',
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

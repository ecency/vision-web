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
 * The order the login page offers the methods in.
 *
 * `keychain` is a desktop browser extension, so on a phone its card can only
 * render an install prompt for software the device cannot run. Offered first,
 * that install prompt was the first thing an owner opening their own site on a
 * phone read, and it looks exactly like a dead end. Methods that need nothing
 * installed lead instead; the extension keeps its card for the desktop visitor
 * who has one, one place further down.
 *
 * This orders, it never filters: `availableAuthMethods` already decided what a
 * visitor may be offered, and a method that is not ranked here keeps its
 * configured position at the end rather than vanishing from the page.
 */
const DISPLAY_ORDER: readonly AuthMethod[] = [
  'hiveauth',
  'hivesigner',
  'keychain',
];

export function orderAuthMethods(
  methods: readonly AuthMethod[],
): AuthMethod[] {
  const rank = (method: AuthMethod) => {
    const index = DISPLAY_ORDER.indexOf(method);
    return index === -1 ? DISPLAY_ORDER.length : index;
  };

  // Sorted on an explicit original index rather than relying on the runtime's
  // sort being stable, so unranked methods keep the order the owner configured.
  return methods
    .map((method, index) => ({ method, index }))
    .sort((a, b) => rank(a.method) - rank(b.method) || a.index - b.index)
    .map((entry) => entry.method);
}

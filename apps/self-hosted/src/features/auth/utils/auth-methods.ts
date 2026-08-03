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

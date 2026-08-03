import { resolveHivesignerClientId } from '@/features/auth/utils/hivesigner';

/**
 * What the owner is told when Hivesigner is configured but cannot work.
 *
 * Both routes are named because they lead to different actions: registering an
 * app is something the owner does alone, registering this site on the shared
 * app is something only Ecency can do.
 */
export const HIVESIGNER_SETUP_NOTICE =
  "Hivesigner is listed as a login method but this site has no Hivesigner client id, so the button stays hidden. Add your own app id under General Settings > Hivesigner, or email hello@ecency.com to get this site's /auth address registered on the shared ecency.app app.";

const AUTH_PATH = [
  'configuration',
  'instanceConfiguration',
  'features',
  'auth',
] as const;
const CLIENT_ID_PATH = [
  'configuration',
  'general',
  'hivesigner',
  'clientId',
] as const;

function readKey(source: unknown, key: string): unknown {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return undefined;
  }
  return (source as Record<string, unknown>)[key];
}

function readPath(source: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((value, key) => readKey(value, key), source);
}

/**
 * The notice for a config that asks for Hivesigner login it cannot serve, or
 * null when there is nothing to say.
 *
 * The method is hidden from readers in that state and no broken button is ever
 * rendered, which is correct and stays that way. What was missing is that the
 * owner had no way to tell a silent method from a broken one. Takes the config
 * document rather than reading the loaded one, so the editor can check what is
 * on screen, unsaved edits included.
 */
export function getHivesignerSetupNotice(config: unknown): string | null {
  const auth = readPath(config, AUTH_PATH);
  // Same rule the app applies: absent means off, and with login off there is no
  // button to miss.
  if (readKey(auth, 'enabled') !== true) return null;

  const methods = readKey(auth, 'methods');
  if (!Array.isArray(methods) || !methods.includes('hivesigner')) return null;

  return resolveHivesignerClientId(readPath(config, CLIENT_ID_PATH)) === null
    ? HIVESIGNER_SETUP_NOTICE
    : null;
}

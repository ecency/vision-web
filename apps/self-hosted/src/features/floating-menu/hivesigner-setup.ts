import { isSharedAppHost, resolveHivesignerClientId } from '@/features/auth/utils/hivesigner';

/**
 * What the owner is told when Hivesigner is configured but cannot work.
 *
 * Both routes are named because they lead to different actions: registering an
 * app is something the owner does alone, registering this site on the shared
 * app is something only Ecency can do.
 */
export const HIVESIGNER_SETUP_NOTICE =
  "Hivesigner is listed as a login method but this site has no Hivesigner client id, so the button stays hidden. Add your own app id under General Settings > Hivesigner, or email hello@ecency.com to get this site's /auth address registered on the shared ecency.app app.";

/**
 * The same gap on a managed blog, where the owner has nothing to do.
 *
 * Registration is automatic there: a scheduled job adds the instance's /auth
 * address to the shared app and only then writes the client id, so the two can
 * never disagree. Telling a managed owner to email support would send them to
 * ask for something that completes on its own within minutes, and the wait is
 * the only part they need explained.
 */
export const HIVESIGNER_MANAGED_SETUP_NOTICE =
  "Hivesigner is listed as a login method but this site's address is not registered with the shared Hivesigner app yet, so the button stays hidden. Registration is automatic on a managed blog and completes within a few minutes of the site going live. Add your own app id under General Settings > Hivesigner if you would rather not wait.";

/**
 * A managed blog on its custom domain. The shared app registers only the hosted
 * subdomain, so its button is hidden here for good, not for a few minutes: the
 * owner's own app, registered for this domain, is the way to offer it.
 */
export const HIVESIGNER_CUSTOM_DOMAIN_NOTICE =
  "Hivesigner is listed as a login method, but the shared Hivesigner app is only offered on your blogs.ecency.com address, so the button is hidden on this custom domain. To offer it here, register this domain on your own Hivesigner app and add its id under General Settings > Hivesigner.";

const MANAGED_PATH = [
  'configuration',
  'instanceConfiguration',
  'managed',
] as const;

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
export function getHivesignerSetupNotice(
  config: unknown,
  hostname: string = typeof window === 'undefined' ? '' : window.location.hostname,
): string | null {
  const auth = readPath(config, AUTH_PATH);
  // Same rule the app applies: absent means off, and with login off there is no
  // button to miss.
  if (readKey(auth, 'enabled') !== true) return null;

  const methods = readKey(auth, 'methods');
  if (!Array.isArray(methods) || !methods.includes('hivesigner')) return null;

  // `managed` is injected into the served config by the hosting service and is
  // never stored, so it cannot be set by a self-hosted config claiming a
  // registration nobody is going to perform for it.
  const managed = readPath(config, MANAGED_PATH) === true;
  const configured = readPath(config, CLIENT_ID_PATH);
  if (resolveHivesignerClientId(configured, { managed, hostname }) !== null) {
    return null;
  }
  // Named the shared app, on a custom domain where it is never registered.
  if (managed && resolveHivesignerClientId(configured) !== null && !isSharedAppHost(hostname)) {
    return HIVESIGNER_CUSTOM_DOMAIN_NOTICE;
  }
  return managed ? HIVESIGNER_MANAGED_SETUP_NOTICE : HIVESIGNER_SETUP_NOTICE;
}

import type { ConfigValue } from './types';

/**
 * Fields the server refused to store, from the PATCH response.
 *
 * A save can succeed while parts of it are dropped: the server pins identity
 * fields such as the instance type, and drops post filters the pinned type
 * cannot serve. Without reading this the editor reported "Saved!" while still
 * displaying the value that was thrown away.
 */
export function readDiscarded(payload: unknown): string[] {
  const discarded = (payload as { discarded?: unknown } | null)?.discarded;
  if (!Array.isArray(discarded)) return [];
  return discarded
    .map((entry) => (entry as { path?: unknown })?.path)
    .filter((path): path is string => typeof path === 'string');
}

/**
 * The config the server actually stored, which is authoritative: it pins the
 * identity fields and drops values that disagree with the stored shape.
 */
export function readSavedConfig(
  payload: unknown,
): Record<string, ConfigValue> | null {
  const saved = (payload as { config?: unknown } | null)?.config;
  if (
    saved &&
    typeof saved === 'object' &&
    !Array.isArray(saved) &&
    'configuration' in saved
  ) {
    return saved as Record<string, ConfigValue>;
  }
  return null;
}

/**
 * Carry over the markers the server strips before storing.
 *
 * ConfigService injects instanceConfiguration.managed when it serves the file,
 * and TenantService deletes it again before storing, so it is absent from the
 * save response. Adopting that response verbatim tells the running app it is
 * not on managed hosting, and on a custom domain that flag is the only signal
 * there is, so the next save in the same page would refuse with "This site is
 * not on managed hosting".
 */
export function withServedOnlyMarkers(
  saved: Record<string, ConfigValue>,
  managed: boolean | undefined,
): Record<string, ConfigValue> {
  if (managed !== true) return saved;
  const configuration = saved.configuration as
    | Record<string, ConfigValue>
    | undefined;
  const instance = configuration?.instanceConfiguration as
    | Record<string, ConfigValue>
    | undefined;
  if (!configuration || !instance) return saved;
  return {
    ...saved,
    configuration: {
      ...configuration,
      instanceConfiguration: { ...instance, managed: true },
    },
  };
}

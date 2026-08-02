import { ConfigManager } from '@ecency/sdk';
import type { QueryClient } from '@tanstack/react-query';

/**
 * DMCA filtering lists.
 *
 * The SDK's post queries all run their results through filterDmcaEntry, but it
 * reads lists that stay empty until ConfigManager.setDmcaLists is called. That
 * call was missing here, so takedown-listed content was served unfiltered on
 * every instance. apps/web loads the same three files, bundled from its own
 * public/dmca; this app is a static bundle deployed independently of them, so
 * it reads them over the network instead and picks up updates without a
 * rebuild.
 *
 * Failure is not fatal. A blocked or unreachable fetch leaves that list empty
 * and the page still renders, which is the same state the app was already in.
 */
const DMCA_LIST_BASE = 'https://ecency.com/dmca';

const DMCA_LIST_SOURCES = [
  { file: 'dmca-accounts.json', key: 'accounts' },
  { file: 'dmca-tags.json', key: 'tags' },
  { file: 'dmca-posts.json', key: 'posts' },
] as const;

/** Bounded so a hanging response cannot keep the request open indefinitely. */
const FETCH_TIMEOUT_MS = 10_000;

async function fetchList(file: string, key: string): Promise<string[]> {
  const response = await fetch(`${DMCA_LIST_BASE}/${file}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`${file} responded ${response.status}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const list = payload?.[key];

  return Array.isArray(list)
    ? list.filter((item): item is string => typeof item === 'string')
    : [];
}

async function fetchLists() {
  const [accounts, tags, posts] = await Promise.all(
    DMCA_LIST_SOURCES.map(({ file, key }) =>
      fetchList(file, key).catch((error) => {
        // One unreachable list must not discard the two that did load.
        console.warn(`[DMCA] Could not load ${file}:`, error);
        return [] as string[];
      }),
    ),
  );

  return { accounts, tags, posts };
}

let pending: Promise<void> | undefined;

/**
 * Loads the lists into the SDK config. Memoised: repeated calls share the first
 * request. Always resolves, and always applies whatever it managed to fetch.
 *
 * Post queries are refetched once the lists land. Nothing about rendering may
 * wait on a remote origin, so the fetch is not awaited, which leaves a window
 * where a query resolves first: filterDmcaEntry runs against an empty
 * configuration, and the unfiltered result is cached and displayed for the rest
 * of the session. Refetching closes it. Every post key starts with "posts", so
 * one invalidation reaches them all.
 *
 * Skipped when nothing was loaded, since there is then nothing to filter and
 * the refetch would be pure cost for every visitor whenever the lists are
 * unreachable.
 */
export function loadDmcaLists(queryClient?: QueryClient): Promise<void> {
  pending ??= fetchLists().then((lists) => {
    ConfigManager.setDmcaLists(lists);

    const listed =
      lists.accounts.length + lists.tags.length + lists.posts.length;
    if (listed > 0 && queryClient) {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    }
  });
  return pending;
}

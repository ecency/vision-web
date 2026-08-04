import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setDmcaLists = vi.fn();

vi.mock('@ecency/sdk', () => ({
  ConfigManager: {
    setDmcaLists: (...args: unknown[]) => setDmcaLists(...args),
  },
}));

type Payload = Record<string, unknown>;

function respond(payloads: Record<string, Payload>) {
  return vi.fn(async (url: string) => {
    const file = url.split('/').pop() as string;
    const payload = payloads[file];
    if (!payload) {
      throw new Error(`unexpected request for ${file}`);
    }
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    } as unknown as Response;
  });
}

const FULL = {
  'dmca-accounts.json': { accounts: ['@baduser'] },
  'dmca-tags.json': { tags: ['badtag'] },
  'dmca-posts.json': { posts: ['@baduser/stolen-post'] },
};

/** Fresh module each time, so the memoised promise does not leak between tests. */
async function importLoader() {
  vi.resetModules();
  return (await import('./dmca')).loadDmcaLists;
}

beforeEach(() => {
  setDmcaLists.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadDmcaLists', () => {
  it('applies the fetched lists to the SDK config', async () => {
    vi.stubGlobal('fetch', respond(FULL));
    const loadDmcaLists = await importLoader();

    await loadDmcaLists();

    // Without this call the SDK's dmca patterns stay empty and every
    // filterDmcaEntry in the query path is a no-op, which is the defect.
    expect(setDmcaLists).toHaveBeenCalledTimes(1);
    expect(setDmcaLists).toHaveBeenCalledWith({
      accounts: ['@baduser'],
      tags: ['badtag'],
      posts: ['@baduser/stolen-post'],
    });
  });

  it('requests the three published list files', async () => {
    const fetchMock = respond(FULL);
    vi.stubGlobal('fetch', fetchMock);
    const loadDmcaLists = await importLoader();

    await loadDmcaLists();

    const requested = fetchMock.mock.calls.map(([url]) => url as string).sort();
    expect(requested).toEqual([
      'https://ecency.com/dmca/dmca-accounts.json',
      'https://ecency.com/dmca/dmca-posts.json',
      'https://ecency.com/dmca/dmca-tags.json',
    ]);
  });

  it('fails open when the network is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const loadDmcaLists = await importLoader();

    // Must resolve, not reject: this runs at bootstrap and a rejection there
    // would surface as an unhandled rejection on every load.
    await expect(loadDmcaLists()).resolves.toBeUndefined();
    expect(setDmcaLists).toHaveBeenCalledWith({
      accounts: [],
      tags: [],
      posts: [],
    });
  });

  it('keeps the lists that loaded when one of them fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('dmca-tags.json')) {
          return { ok: false, status: 503 } as unknown as Response;
        }
        const file = url.split('/').pop() as string;
        return {
          ok: true,
          status: 200,
          json: async () => FULL[file as keyof typeof FULL],
        } as unknown as Response;
      }),
    );
    const loadDmcaLists = await importLoader();

    await loadDmcaLists();

    expect(setDmcaLists).toHaveBeenCalledWith({
      accounts: ['@baduser'],
      tags: [],
      posts: ['@baduser/stolen-post'],
    });
  });

  it('drops entries that are not strings and tolerates a missing key', async () => {
    vi.stubGlobal(
      'fetch',
      respond({
        'dmca-accounts.json': { accounts: ['@baduser', 42, null] },
        'dmca-tags.json': {},
        'dmca-posts.json': { posts: 'not-an-array' },
      }),
    );
    const loadDmcaLists = await importLoader();

    await loadDmcaLists();

    expect(setDmcaLists).toHaveBeenCalledWith({
      accounts: ['@baduser'],
      tags: [],
      posts: [],
    });
  });

  it('fetches once however many callers ask', async () => {
    const fetchMock = respond(FULL);
    vi.stubGlobal('fetch', fetchMock);
    const loadDmcaLists = await importLoader();

    await Promise.all([loadDmcaLists(), loadDmcaLists()]);
    await loadDmcaLists();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(setDmcaLists).toHaveBeenCalledTimes(1);
  });

  /**
   * The fetch is not awaited, so a post query can resolve against an empty
   * configuration and cache the unfiltered result. Without a refetch the listed
   * content stays on screen for the rest of the session.
   */
  it('refetches post queries once the lists land', async () => {
    vi.stubGlobal('fetch', respond(FULL));
    const loadDmcaLists = await importLoader();
    const resetQueries = vi.fn();

    await loadDmcaLists({ resetQueries } as never);

    expect(resetQueries).toHaveBeenCalledWith({ queryKey: ['posts'] });
  });

  it('does not refetch when the lists came back empty', async () => {
    vi.stubGlobal(
      'fetch',
      respond({
        'dmca-accounts.json': { accounts: [] },
        'dmca-tags.json': { tags: [] },
        'dmca-posts.json': { posts: [] },
      }),
    );
    const loadDmcaLists = await importLoader();
    const resetQueries = vi.fn();

    await loadDmcaLists({ resetQueries } as never);

    // Nothing to filter, so the refetch would cost every visitor a round of
    // requests for no change whenever the lists are unreachable. The empty
    // lists are the lists in force and the cache already agrees with them.
    expect(resetQueries).not.toHaveBeenCalled();
  });
});

/**
 * The property the reading surfaces depend on.
 *
 * Those surfaces deliberately keep what they have loaded when a request fails,
 * because throwing away sixty posts over one timed-out page is worse than
 * saying the page failed. That is only safe while everything in the cache was
 * filtered under the lists currently in force. A post cached before the lists
 * installed was filtered against nothing, so if it merely got marked stale and
 * its refetch then failed, takedown-listed content would stay on screen.
 *
 * Checked against a real QueryClient rather than a spy, because the difference
 * between invalidating and resetting is not visible in the call, only in what
 * is left in the cache afterwards.
 */
describe('cached posts do not survive the lists installing', () => {
  const KEY = ['posts', 'entry', '@baduser/stolen-post'];
  const UNFILTERED = { author: 'baduser', permlink: 'stolen-post', body: 'x' };

  async function seededClient() {
    const { QueryClient } = await import('@tanstack/react-query');
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // Exactly the losing side of the startup race: the query resolved while
    // the lists were still in flight, so filterDmcaEntry ran against nothing.
    client.setQueryData(KEY, UNFILTERED);
    return client;
  }

  it('clears post data that predates the lists', async () => {
    vi.stubGlobal('fetch', respond(FULL));
    const loadDmcaLists = await importLoader();
    const client = await seededClient();

    await loadDmcaLists(client);

    // Not "is marked stale": gone. A refetch that fails must not be able to
    // put this back on screen.
    expect(client.getQueryData(KEY)).toBeUndefined();
    client.clear();
  });

  it('leaves nothing behind for a failed refetch to fall back to', async () => {
    vi.stubGlobal('fetch', respond(FULL));
    const loadDmcaLists = await importLoader();
    const client = await seededClient();

    await loadDmcaLists(client);

    // Stand in for the refetch exhausting its retries. Under invalidation the
    // entry is still there at this point, which is the hole.
    const state = client.getQueryState(KEY);
    expect(state?.data).toBeUndefined();
    client.clear();
  });

  it('touches only post data', async () => {
    vi.stubGlobal('fetch', respond(FULL));
    const loadDmcaLists = await importLoader();
    const client = await seededClient();
    client.setQueryData(['accounts', 'alice'], { name: 'alice' });

    await loadDmcaLists(client);

    expect(client.getQueryData(['accounts', 'alice'])).toEqual({
      name: 'alice',
    });
    client.clear();
  });
});

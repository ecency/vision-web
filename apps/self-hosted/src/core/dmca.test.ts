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
});

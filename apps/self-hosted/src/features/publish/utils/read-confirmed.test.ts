import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  type QueryOutcome,
  resolveQueryOutcome,
} from '@/features/shared/query-outcome';
import { isReadConfirmed, type ReadEvidence } from './read-confirmed';

const ALL: QueryOutcome[] = [
  'content',
  'stale',
  'failed',
  'empty',
  'unasked',
  'pending',
];

const evidence = (over: Partial<ReadEvidence> = {}): ReadEvidence => ({
  outcome: 'content',
  fetchedAfterMount: true,
  ...over,
});

describe('isReadConfirmed', () => {
  it('confirms on a read that settled during this mount and succeeded', () => {
    expect(isReadConfirmed(evidence(), false)).toBe(true);
  });

  it('does not confirm on cached data that was never re-read', () => {
    // The defect this gate exists for, and the one its first version missed.
    // A cached entry reports a successful outcome with no request behind it.
    expect(
      isReadConfirmed(
        evidence({ outcome: 'content', fetchedAfterMount: false }),
        false,
      ),
    ).toBe(false);
  });

  it('does not confirm when the read belonging to this mount failed', () => {
    // isFetchedAfterMount counts error updates too, so it is true here while
    // the entry on screen is still the old cached one.
    expect(
      isReadConfirmed(
        evidence({ outcome: 'stale', fetchedAfterMount: true }),
        false,
      ),
    ).toBe(false);
  });

  it('confirms off no other outcome, whatever the fetch flag says', () => {
    for (const fetchedAfterMount of [false, true]) {
      const confirming = ALL.filter((outcome) =>
        isReadConfirmed({ outcome, fetchedAfterMount }, false),
      );
      expect(confirming).toEqual(fetchedAfterMount ? ['content'] : []);
    }
  });

  it('stays confirmed once a read has succeeded', () => {
    // A later failure must not close an editor holding unsaved work.
    for (const outcome of ALL) {
      for (const fetchedAfterMount of [false, true]) {
        expect(isReadConfirmed({ outcome, fetchedAfterMount }, true)).toBe(
          true,
        );
      }
    }
  });
});

/**
 * The gate rests on two claims about query-core that are invisible in the
 * component and one of which was wrong the first time: that a successful status
 * means a read happened (it does not), and that a fetch is issued on mount (it
 * is not, under the global one minute staleTime). So the claims are measured
 * against the installed query-core rather than taken from the names.
 *
 * Driven through a real QueryObserver with the options the edit route uses.
 * `.tsx` cannot be rendered in this suite, but none of this is a React concern:
 * the observer is where these flags are computed.
 */
describe('the query-core contract the gate depends on', () => {
  const KEY = ['posts', 'entry', '@alice/a-post'];
  const CACHED = { author: 'alice', permlink: 'a-post', title: 'cached' };
  const FRESH = { author: 'alice', permlink: 'a-post', title: 'fresh' };

  interface Mounted {
    /** Evidence at first render, before anything belonging to it has settled. */
    onMount: ReadEvidence;
    /** The same once the mount's fetch has settled. */
    settled: ReadEvidence;
    /** How many times the query function ran. */
    calls: number;
  }

  async function mountEditorQuery({
    warm,
    fail,
    override = true,
  }: {
    warm: boolean;
    fail: boolean;
    /** False leaves refetchOnMount absent, as every other query in the app has it. */
    override?: boolean;
  }): Promise<Mounted> {
    const client = new QueryClient();
    if (warm) client.setQueryData(KEY, CACHED);

    const queryFn = vi.fn(async () => {
      if (fail) throw new Error('bridge unreachable');
      return FRESH;
    });

    const observer = new QueryObserver(client, {
      queryKey: KEY,
      queryFn,
      // The app's global defaults, plus the editor's own override. The option
      // is omitted rather than set to undefined when the override is off: a
      // key present with an undefined value is not the same thing to the
      // observer as a key that is not there.
      staleTime: 60_000,
      retry: false,
      ...(override ? { refetchOnMount: 'always' as const } : {}),
    });

    const read = (): ReadEvidence => {
      const r = observer.getCurrentResult();
      return {
        outcome: resolveQueryOutcome({
          isEnabled: r.isEnabled,
          isError: r.isError,
          isSuccess: r.isSuccess,
          hasContent: r.data !== undefined,
        }),
        fetchedAfterMount: r.isFetchedAfterMount,
      };
    };

    const onMount = read();
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() =>
      expect(observer.getCurrentResult().isFetching).toBe(false),
    );
    const settled = read();
    unsubscribe();
    client.clear();

    return { onMount, settled, calls: queryFn.mock.calls.length };
  }

  it('does not fetch on mount at all without the always override', async () => {
    // The realistic path: a reader opens a post and clicks Edit inside the
    // minute. Nothing is requested, so isFetchedAfterMount can never become
    // true, and the override is what makes this gate operable rather than a
    // permanent lock.
    const m = await mountEditorQuery({
      warm: true,
      fail: false,
      override: false,
    });

    expect(m.calls).toBe(0);
    // and the outcome reads as a success the whole time, which is the trap
    expect(m.onMount.outcome).toBe('content');
    expect(m.settled.fetchedAfterMount).toBe(false);
    expect(isReadConfirmed(m.settled, false)).toBe(false);
  });

  it("fetches on mount with 'always' despite the stale time", async () => {
    const m = await mountEditorQuery({ warm: true, fail: false });
    expect(m.calls).toBe(1);
  });

  it('does not open the editor before the mount read resolves', async () => {
    const m = await mountEditorQuery({ warm: true, fail: false });

    // The cache is warm, so an entry exists and the outcome already reads as a
    // success. The fetch flag is the only thing separating this from a read.
    expect(m.onMount.outcome).toBe('content');
    expect(m.onMount.fetchedAfterMount).toBe(false);
    expect(isReadConfirmed(m.onMount, false)).toBe(false);
  });

  it('opens the editor once that read succeeds', async () => {
    const m = await mountEditorQuery({ warm: true, fail: false });

    expect(m.settled.fetchedAfterMount).toBe(true);
    expect(m.settled.outcome).toBe('content');
    expect(isReadConfirmed(m.settled, false)).toBe(true);
  });

  it('keeps the editor shut when the mount read fails on a warm cache', async () => {
    const m = await mountEditorQuery({ warm: true, fail: true });

    // isFetchedAfterMount counts the error update, so on its own it would open
    // the editor here, on the cached entry. That is the overwrite.
    expect(m.settled.fetchedAfterMount).toBe(true);
    expect(m.settled.outcome).toBe('stale');
    expect(isReadConfirmed(m.settled, false)).toBe(false);
  });

  it('shows the notice rather than the editor with no cache and a failing read', async () => {
    const m = await mountEditorQuery({ warm: false, fail: true });

    expect(m.settled.outcome).toBe('failed');
    expect(isReadConfirmed(m.settled, false)).toBe(false);
  });

  it('does not close an editor that is already open when a later read fails', async () => {
    const opened = await mountEditorQuery({ warm: true, fail: false });
    const confirmed = isReadConfirmed(opened.settled, false);
    expect(confirmed).toBe(true);

    // Whatever a later background fetch does, the author keeps the editor and
    // everything they have typed into it.
    const later = await mountEditorQuery({ warm: true, fail: true });
    expect(later.settled.outcome).toBe('stale');
    expect(isReadConfirmed(later.settled, confirmed)).toBe(true);
  });
});

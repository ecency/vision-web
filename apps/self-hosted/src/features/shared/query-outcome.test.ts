import { describe, expect, it } from 'vitest';
import {
  nothingToShow,
  type QueryFacts,
  type QueryOutcome,
  resolveQueryOutcome,
} from './query-outcome';

const facts = (over: Partial<QueryFacts> = {}): QueryFacts => ({
  isEnabled: true,
  isError: false,
  isSuccess: false,
  hasContent: false,
  ...over,
});

/** Every combination of the four inputs, so no case is decided by accident. */
function everyCombination(): QueryFacts[] {
  const out: QueryFacts[] = [];
  for (const isEnabled of [false, true]) {
    for (const isError of [false, true]) {
      for (const isSuccess of [false, true]) {
        for (const hasContent of [false, true]) {
          out.push({ isEnabled, isError, isSuccess, hasContent });
        }
      }
    }
  }
  return out;
}

describe('resolveQueryOutcome', () => {
  it('keeps content when a later attempt fails', () => {
    // The page-three failure. Sixty posts are on screen; the answer has to be
    // "still here, and the last request failed", never "gone".
    expect(
      resolveQueryOutcome(
        facts({ isSuccess: true, hasContent: true, isError: true }),
      ),
    ).toBe('stale');
  });

  it('reports content with nothing outstanding as content', () => {
    expect(
      resolveQueryOutcome(facts({ isSuccess: true, hasContent: true })),
    ).toBe('content');
  });

  it('separates a failure with nothing on screen from emptiness', () => {
    expect(resolveQueryOutcome(facts({ isError: true }))).toBe('failed');
  });

  it('only calls it empty when a response came back carrying nothing', () => {
    expect(resolveQueryOutcome(facts({ isSuccess: true }))).toBe('empty');
  });

  it('separates a query that was never switched on', () => {
    // A post URL with no permlink, an instance with no username: nothing was
    // asked, and nothing ever will be.
    expect(resolveQueryOutcome(facts({ isEnabled: false }))).toBe('unasked');
  });

  it('reports an unanswered query as pending, not as empty', () => {
    // This is also the offline shape. React Query pauses a fetch when the
    // browser reports no connection: no data, no error, and isLoading false,
    // because nothing is in flight. Read as data it says the author has
    // published nothing.
    expect(resolveQueryOutcome(facts())).toBe('pending');
  });

  it('never claims emptiness off anything but a success or an unasked query', () => {
    for (const f of everyCombination()) {
      const outcome = resolveQueryOutcome(f);
      if (!nothingToShow(outcome)) continue;
      // Reached the point where a component would print "No posts found."
      expect(f.hasContent).toBe(false);
      expect(f.isError).toBe(false);
      expect(f.isSuccess || !f.isEnabled).toBe(true);
    }
  });

  it('never discards content, whatever else is true', () => {
    for (const f of everyCombination()) {
      if (!f.hasContent) continue;
      const outcome = resolveQueryOutcome(f);
      expect(['content', 'stale']).toContain(outcome);
    }
  });

  it('surfaces every failure either as failed or as stale', () => {
    for (const f of everyCombination()) {
      if (!f.isError) continue;
      const outcome = resolveQueryOutcome(f);
      expect(outcome).toBe(f.hasContent ? 'stale' : 'failed');
    }
  });

  it('resolves every combination to exactly one outcome', () => {
    const table = everyCombination().map((f) => [
      `${f.isEnabled ? 'on' : 'off'}/${f.isError ? 'err' : '-'}/${
        f.isSuccess ? 'ok' : '-'
      }/${f.hasContent ? 'has' : '-'}`,
      resolveQueryOutcome(f),
    ]);

    expect(Object.fromEntries(table)).toEqual({
      'off/-/-/-': 'unasked',
      'off/-/-/has': 'content',
      'off/-/ok/-': 'empty',
      'off/-/ok/has': 'content',
      'off/err/-/-': 'failed',
      'off/err/-/has': 'stale',
      'off/err/ok/-': 'failed',
      'off/err/ok/has': 'stale',
      'on/-/-/-': 'pending',
      'on/-/-/has': 'content',
      'on/-/ok/-': 'empty',
      'on/-/ok/has': 'content',
      'on/err/-/-': 'failed',
      'on/err/-/has': 'stale',
      'on/err/ok/-': 'failed',
      'on/err/ok/has': 'stale',
    });
  });
});

describe('nothingToShow', () => {
  it('licenses only the two established outcomes', () => {
    const all: QueryOutcome[] = [
      'content',
      'stale',
      'failed',
      'empty',
      'unasked',
      'pending',
    ];
    expect(all.filter(nothingToShow)).toEqual(['empty', 'unasked']);
  });
});

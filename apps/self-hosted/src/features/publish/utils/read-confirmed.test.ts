import { describe, expect, it } from 'vitest';
import type { QueryOutcome } from '@/features/shared/query-outcome';
import { isReadConfirmed } from './read-confirmed';

const ALL: QueryOutcome[] = [
  'content',
  'stale',
  'failed',
  'empty',
  'unasked',
  'pending',
];

describe('isReadConfirmed', () => {
  it('confirms on a successful read', () => {
    expect(isReadConfirmed('content', false)).toBe(true);
  });

  it('does not confirm on a cached entry whose re-read failed', () => {
    // The whole point. 'stale' means there is an entry to render and the last
    // attempt to re-read it failed, so its title and body may already be
    // behind the chain. Editing from it overwrites the newer version.
    expect(isReadConfirmed('stale', false)).toBe(false);
  });

  it('confirms off nothing else', () => {
    const confirming = ALL.filter((o) => isReadConfirmed(o, false));
    expect(confirming).toEqual(['content']);
  });

  it('stays confirmed once a read has succeeded', () => {
    // A later failure must not close an editor holding unsaved work.
    for (const outcome of ALL) {
      expect(isReadConfirmed(outcome, true)).toBe(true);
    }
  });
});

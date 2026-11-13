// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Round 5, item 1: the like count. The button adds nothing to the count. It
 * makes sure the SDK knows the voter's prior vote before broadcasting, and the
 * count is read from the entry cache key the SDK's vote update moves: the
 * voted post's own key, which for a cross-post is the original's. Every case
 * below runs the REAL applyVoteCacheUpdate.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  lookup: vi.fn(),
  broadcast: vi.fn(),
}));

vi.mock('@ecency/sdk', async () => {
  const actual = await vi.importActual<Record<string, any>>('@ecency/sdk');
  return {
    ...actual,
    // The broadcast is the only fake: after it, the REAL cache update runs,
    // as useVote's onSuccess does.
    useVote: (username: string) => ({
      mutateAsync: async (vars: unknown) => {
        await state.broadcast(vars);
        actual.applyVoteCacheUpdate(username, vars, currentQc);
      },
    }),
    getEntryVoteQueryOptions: (author?: string, permlink?: string, voter?: string, enabled = true) => ({
      queryKey: actual.QueryKeys.posts.entryVote(author, permlink, voter),
      queryFn: () => state.lookup(author, permlink, voter),
      enabled: enabled && !!author && !!permlink && !!voter,
      staleTime: Infinity,
    }),
  };
});
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/providers/sdk', () => ({ createBroadcastAdapter: () => ({}) }));
vi.mock('@/core', () => ({ t: (k: string) => k }));
vi.mock('@/features/auth/hooks', () => ({
  useAuth: () => ({ user: { username: 'alice' } }),
  useIsAuthenticated: () => true,
  useIsAuthEnabled: () => true,
}));

import { QueryKeys } from '@ecency/sdk';
import { PostLikes } from './post-likes';

let currentQc: QueryClient;
let root: Root;
let container: HTMLDivElement;

const post = (permlink: string, over: Record<string, unknown> = {}) => ({
  author: 'bob',
  permlink,
  payout: 1,
  stats: { total_votes: 10, flag_weight: 0, gray: false, hide: false },
  observer_vote: null,
  observer_vote_for: null,
  ...over,
});

async function render(entry: any) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={currentQc}>
        <PostLikes entry={entry} />
      </QueryClientProvider>,
    );
  });
  await tick();
}
const tick = () => act(async () => new Promise((r) => setTimeout(r, 0)));
async function click() {
  await act(async () => {
    container.querySelector('button')!.click();
  });
  await tick();
  await tick();
}
const count = () => container.textContent?.match(/(\d+) likes/)?.[1];

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network disabled in this spec'));
  currentQc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  state.lookup.mockReset();
  state.broadcast.mockReset();
  state.broadcast.mockResolvedValue(undefined);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('PostLikes', () => {
  it('vote then unvote on a post, then revote: 10, 11, 11, 11', async () => {
    const entry = post('normal');
    currentQc.setQueryData(QueryKeys.posts.entry('/@bob/normal'), entry);
    state.lookup.mockResolvedValue(null);
    await render(entry);
    expect(count()).toBe('10');
    await click();
    expect(count()).toBe('11');
    // Hivemind keeps the removed vote as a percent 0 row and still counts it
    // (#2070): the unvote keeps 11, and so does the revote over that row.
    await click();
    expect(count()).toBe('11');
    await click();
    expect(count()).toBe('11');
  });

  it('vote then unvote on a cross-post, then revote: 10, 11, 11, 11', async () => {
    const outer = { author: 'carol', permlink: 'xpost', original_entry: post('orig') };
    currentQc.setQueryData(QueryKeys.posts.entry('/@carol/xpost'), outer);
    state.lookup.mockResolvedValue(null);
    await render(outer);
    expect(count()).toBe('10');
    await click();
    expect(count()).toBe('11');
    // Hivemind keeps the removed vote as a percent 0 row and still counts it
    // (#2070): the unvote keeps 11, and so does the revote over that row.
    await click();
    expect(count()).toBe('11');
    await click();
    expect(count()).toBe('11');
  });

  it('vote before the lookup answered, then unvote, then revote: 10, 11, 11, 11', async () => {
    const entry = post('early');
    currentQc.setQueryData(QueryKeys.posts.entry('/@bob/early'), entry);
    let answer: (v: unknown) => void = () => {};
    state.lookup.mockImplementation(() => new Promise((r) => (answer = r)));
    await render(entry);
    await act(async () => {
      container.querySelector('button')!.click();
    });
    await act(async () => answer(null));
    await tick();
    await tick();
    expect(count()).toBe('11');
    // Hivemind keeps the removed vote as a percent 0 row and still counts it
    // (#2070): the unvote keeps 11, and so does the revote over that row.
    await click();
    expect(count()).toBe('11');
    await click();
    expect(count()).toBe('11');
  });

  it('a weight change by a user who already voted keeps 10', async () => {
    const entry = post('reweight');
    currentQc.setQueryData(QueryKeys.posts.entry('/@bob/reweight'), entry);
    let answer: (v: unknown) => void = () => {};
    state.lookup.mockImplementation(() => new Promise((r) => (answer = r)));
    await render(entry);
    // Clicked before the lookup answered: the button casts a 100% vote over
    // an existing 50% vote. That changes the weight, not the count.
    await act(async () => {
      container.querySelector('button')!.click();
    });
    await act(async () => answer({ rshares: 5, percent: 5000 }));
    await tick();
    await tick();
    expect(state.broadcast).toHaveBeenCalledTimes(1);
    expect(count()).toBe('10');
  });

  it('a refetch that returns the old count for another reason shows it, adding nothing', async () => {
    const entry = post('refetch');
    const key = QueryKeys.posts.entry('/@bob/refetch');
    currentQc.setQueryData(key, entry);
    state.lookup.mockResolvedValue(null);
    await render(entry);
    await click();
    expect(count()).toBe('11');
    await act(async () => {
      currentQc.setQueryData(key, { ...entry, stats: { ...entry.stats, total_votes: 10 } });
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(count()).toBe('10');
  });

  // Round 6, item 2: a failing lookup does not stall the click through the
  // client's default retries (3, with backoff: 7 s or more).
  it('a failing lookup lets the vote go out after one attempt', async () => {
    currentQc = new QueryClient({ defaultOptions: { queries: { retry: 3, staleTime: Infinity } } });
    const entry = post('lookup-down');
    currentQc.setQueryData(QueryKeys.posts.entry('/@bob/lookup-down'), entry);
    state.lookup.mockRejectedValue(new Error('all nodes down'));
    await render(entry);
    const t0 = Date.now();
    await click();
    await vi.waitFor(() => expect(state.broadcast).toHaveBeenCalledTimes(1), { timeout: 800 });
    expect(Date.now() - t0).toBeLessThan(800);
    expect(state.lookup.mock.calls.length).toBeLessThanOrEqual(2);
  });

  // Round 6, item 3: when the click-time lookup failed, the prior vote stays
  // unknown; the cast vote is not written as though it were known, so a quick
  // second click cannot subtract from a count that never went up.
  it('a failed lookup, a vote and a second click leave 10', async () => {
    const entry = post('unknown-prior');
    currentQc.setQueryData(QueryKeys.posts.entry('/@bob/unknown-prior'), entry);
    state.lookup.mockRejectedValue(new Error('all nodes down'));
    await render(entry);
    await click();
    expect(count()).toBe('10');
    await click();
    expect(count()).toBe('10');
  });

  // PR review, item 12: the cross-post carries a copy of the original; the
  // newer of that copy and the original's own cached entry is shown.
  it('shows a newer embedded original over an older cached one', async () => {
    const originalKey = QueryKeys.posts.entry('/@bob/orig-newer');
    currentQc.setQueryData(originalKey, post('orig-newer', { stats: { total_votes: 5, flag_weight: 0, gray: false, hide: false } }), {
      updatedAt: 1_000,
    });
    const outer = { author: 'carol', permlink: 'xp-newer', original_entry: post('orig-newer') };
    currentQc.setQueryData(QueryKeys.posts.entry('/@carol/xp-newer'), outer, { updatedAt: 2_000 });
    await render(outer);
    expect(count()).toBe('10');
    expect(currentQc.getQueryState(originalKey)?.dataUpdatedAt).toBe(2_000);
  });

  it('keeps a newer cached original over an older embedded copy', async () => {
    const originalKey = QueryKeys.posts.entry('/@bob/orig-older');
    currentQc.setQueryData(originalKey, post('orig-older', { stats: { total_votes: 12, flag_weight: 0, gray: false, hide: false } }), {
      updatedAt: 3_000,
    });
    const outer = { author: 'carol', permlink: 'xp-older', original_entry: post('orig-older') };
    currentQc.setQueryData(QueryKeys.posts.entry('/@carol/xp-older'), outer, { updatedAt: 2_000 });
    await render(outer);
    expect(count()).toBe('12');
  });

  it("seeds an uncached original with the embedded copy's fetch time", async () => {
    const outer = { author: 'carol', permlink: 'xp-seed', original_entry: post('orig-seed') };
    currentQc.setQueryData(QueryKeys.posts.entry('/@carol/xp-seed'), outer, { updatedAt: 2_500 });
    await render(outer);
    expect(count()).toBe('10');
    expect(currentQc.getQueryState(QueryKeys.posts.entry('/@bob/orig-seed'))?.dataUpdatedAt).toBe(2_500);
  });

  // PR review, item 10: the button writes no invented rshares.
  it('writes the cast vote without rshares', async () => {
    const entry = post('no-rshares');
    currentQc.setQueryData(QueryKeys.posts.entry('/@bob/no-rshares'), entry);
    state.lookup.mockResolvedValue(null);
    await render(entry);
    await click();
    expect(currentQc.getQueryData(QueryKeys.posts.entryVote('bob', 'no-rshares', 'alice'))).toEqual({
      rshares: null,
      percent: 10000,
    });
  });

  it('a failed broadcast leaves 10', async () => {
    const entry = post('fails');
    currentQc.setQueryData(QueryKeys.posts.entry('/@bob/fails'), entry);
    state.lookup.mockResolvedValue(null);
    state.broadcast.mockRejectedValue(new Error('out of RC'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await render(entry);
    await click();
    expect(count()).toBe('10');
  });
});

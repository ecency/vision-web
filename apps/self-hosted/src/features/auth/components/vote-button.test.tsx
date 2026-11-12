// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Review H: the like button downloaded the post's whole voter list for every
 * visitor, anonymous ones included (a 1365-vote post: 132 KB+), and showed
 * the list's length (0 until it loaded) as the count. Now: the count is
 * stats.total_votes, and only a logged-in visitor's own vote is looked up.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  user: null as null | { username: string },
  lookup: vi.fn(),
  list: vi.fn(),
  // What the vote mutation does after the broadcast (set per test).
  afterVote: vi.fn(),
}));

vi.mock('@ecency/sdk', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@ecency/sdk');
  return {
    ...actual,
    useVote: () => ({ mutateAsync: (v: unknown) => state.afterVote(v) }),
    getEntryVoteQueryOptions: (author?: string, permlink?: string, voter?: string, enabled = true) => ({
      queryKey: ['posts', 'entry-vote', author, permlink, voter],
      queryFn: () => state.lookup(author, permlink, voter),
      enabled: enabled && !!author && !!permlink && !!voter,
    }),
    getEntryActiveVotesQueryOptions: (entry?: { author: string; permlink: string }) => ({
      queryKey: ['posts', 'entry-active-votes', entry?.author, entry?.permlink],
      queryFn: () => state.list(entry),
      enabled: !!entry,
    }),
  };
});
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/providers/sdk', () => ({ createBroadcastAdapter: () => ({}) }));
vi.mock('@/core', () => ({ t: (k: string) => k }));
vi.mock('../hooks', () => ({
  useAuth: () => ({ user: state.user }),
  useIsAuthenticated: () => !!state.user,
  useIsAuthEnabled: () => true,
}));

import { useQuery } from '@tanstack/react-query';
import { applyVoteCacheUpdate, QueryKeys } from '@ecency/sdk';
import { VoteButton } from './vote-button';

let root: Root;
let container: HTMLDivElement;

async function render(totalVotes: number) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={qc}>
        <VoteButton author="bob" permlink="p" totalVotes={totalVotes} />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('self-hosted VoteButton', () => {
  beforeEach(() => {
    // The real SDK is spread into the mock: nothing may reach a node.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network disabled in this spec'));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    state.lookup.mockReset();
    state.list.mockReset();
    state.list.mockResolvedValue([]);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('shows stats.total_votes and loads nothing for an anonymous visitor', async () => {
    state.user = null;
    await render(1365);
    expect(container.textContent).toContain('1365');
    expect(state.list).not.toHaveBeenCalled();
    expect(state.lookup).not.toHaveBeenCalled();
  });

  it("looks up only the logged-in visitor's own vote and fills the heart", async () => {
    state.user = { username: 'alice' };
    state.lookup.mockResolvedValue({ rshares: 5, percent: 10000 });
    await render(7);
    expect(state.lookup).toHaveBeenCalledWith('bob', 'p', 'alice');
    expect(state.list).not.toHaveBeenCalled();
    expect(container.textContent).toContain('7');
    expect(container.querySelector('button')?.className).toContain('text-red-500');
  });
});

// Delta review 1: the SDK's vote cache update already moves stats.total_votes
// in the entry cache the post page reads; the button must not add its own
// count on top (10 became 12).
describe('self-hosted VoteButton with the real vote cache update', () => {
  const entryKey = QueryKeys.posts.entry('/@bob/p');

  function Page() {
    const { data } = useQuery<any>({ queryKey: entryKey, queryFn: () => null, enabled: false });
    return <VoteButton author="bob" permlink="p" totalVotes={data?.stats?.total_votes ?? 0} />;
  }

  beforeEach(() => {
    // The real SDK is spread into the mock: nothing may reach a node.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network disabled in this spec'));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    state.user = { username: 'alice' };
    state.lookup.mockReset();
    state.lookup.mockResolvedValue(null);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('shows 11 after one vote on a post with 10', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    qc.setQueryData(entryKey, {
      author: 'bob',
      permlink: 'p',
      payout: 1,
      stats: { total_votes: 10, flag_weight: 0, gray: false, hide: false },
      observer_vote: null,
      observer_vote_for: 'alice',
    });
    // The real SDK cache update, as useVote runs it after the broadcast.
    state.afterVote.mockImplementation(async (vars: any) => applyVoteCacheUpdate('alice', vars, qc));

    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <Page />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.textContent).toContain('10 likes');

    await act(async () => {
      container.querySelector('button')!.click();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(container.textContent).toContain('11 likes');
    expect(container.textContent).not.toContain('12');
  });
});

// Round 4, item 7: the visible count moves exactly once also when the SDK's
// update cannot move it: a cross-post (the footer votes on original_entry,
// whose key is not cached) and a vote cast before the lookup answered (the
// SDK does not know the prior vote and leaves the entry alone).
describe('self-hosted VoteButton when the SDK cannot move the count', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network disabled in this spec'));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    state.user = { username: 'alice' };
    state.lookup.mockReset();
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function mount(qc: QueryClient, ui: React.ReactElement) {
    await act(async () => {
      root.render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  async function click() {
    await act(async () => {
      container.querySelector('button')!.click();
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  it('moves a cross-post count once', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const outerKey = QueryKeys.posts.entry('/@carol/xpost');
    qc.setQueryData(outerKey, {
      author: 'carol',
      permlink: 'xpost',
      original_entry: { author: 'bob', permlink: 'p', payout: 1, stats: { total_votes: 10 } },
    });
    state.lookup.mockResolvedValue(null);
    state.afterVote.mockImplementation(async (vars: any) => applyVoteCacheUpdate('alice', vars, qc));
    function CrossPost() {
      const { data } = useQuery<any>({ queryKey: outerKey, queryFn: () => null, enabled: false });
      const o = data.original_entry;
      return <VoteButton author={o.author} permlink={o.permlink} totalVotes={o.stats.total_votes} />;
    }
    await mount(qc, <CrossPost />);
    expect(container.textContent).toContain('10 likes');
    await click();
    expect(container.textContent).toContain('11 likes');
  });

  it('moves a cross-post count once when the original is also cached under its own key', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const outerKey = QueryKeys.posts.entry('/@carol/xpost2');
    qc.setQueryData(outerKey, {
      author: 'carol',
      permlink: 'xpost2',
      original_entry: { author: 'bob', permlink: 'p2', payout: 1, stats: { total_votes: 10 } },
    });
    // The reader opened the original before: the SDK's update moves THIS copy,
    // which the cross-post footer does not show.
    qc.setQueryData(QueryKeys.posts.entry('/@bob/p2'), {
      author: 'bob',
      permlink: 'p2',
      payout: 1,
      stats: { total_votes: 10, flag_weight: 0, gray: false, hide: false },
      observer_vote: null,
      observer_vote_for: 'alice',
    });
    state.lookup.mockResolvedValue(null);
    state.afterVote.mockImplementation(async (vars: any) => applyVoteCacheUpdate('alice', vars, qc));
    function CrossPost() {
      const { data } = useQuery<any>({ queryKey: outerKey, queryFn: () => null, enabled: false });
      const o = data.original_entry;
      return <VoteButton author={o.author} permlink={o.permlink} totalVotes={o.stats.total_votes} />;
    }
    await mount(qc, <CrossPost />);
    await click();
    expect(container.textContent).toContain('11 likes');
  });

  it('moves the count once when the vote lands before the lookup answered, and not again when the entry refetch arrives', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const key = QueryKeys.posts.entry('/@bob/p');
    qc.setQueryData(key, {
      author: 'bob',
      permlink: 'p',
      payout: 1,
      stats: { total_votes: 10, flag_weight: 0, gray: false, hide: false },
      observer_vote: null,
      observer_vote_for: null,
    });
    state.lookup.mockImplementation(() => new Promise(() => {}));
    state.afterVote.mockImplementation(async (vars: any) => applyVoteCacheUpdate('alice', vars, qc));
    function Page() {
      const { data } = useQuery<any>({ queryKey: key, queryFn: () => null, enabled: false });
      return <VoteButton author="bob" permlink="p" totalVotes={data?.stats?.total_votes ?? 0} />;
    }
    await mount(qc, <Page />);
    await click();
    expect(container.textContent).toContain('11 likes');

    // The deferred refresh brings the chain's count, which includes the vote.
    await act(async () => {
      qc.setQueryData(key, (old: any) => ({ ...old, stats: { ...old.stats, total_votes: 11 } }));
      // React Query notifies observers on a later tick.
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.textContent).toContain('11 likes');
    expect(container.textContent).not.toContain('12');
  });
});

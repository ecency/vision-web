// @vitest-environment jsdom

import { act } from 'react';
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

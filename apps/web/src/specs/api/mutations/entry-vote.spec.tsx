import { vi } from "vitest";
import React from "react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { normalizeEntry, QueryKeys } from "@ecency/sdk";

// PR review, items 3 and 4: the web optimistic vote update.
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: { username: "alice" }, username: "alice" })
}));
const broadcast = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/api/sdk-mutations", () => ({ useVoteMutation: () => ({ mutateAsync: broadcast }) }));

import { useEntryVote } from "@/api/mutations/entry-vote";
import type { Entry } from "@/entities";

const entryKey = QueryKeys.posts.entry("/@bob/p");
const lookupKey = QueryKeys.posts.entryVote("bob", "p", "alice");

function entry(over: Partial<Entry> = {}): Entry {
  return {
    author: "bob",
    permlink: "p",
    payout: 1,
    pending_payout_value: "1.000 HBD",
    author_payout_value: "0.000 HBD",
    curator_payout_value: "0.000 HBD",
    stats: { total_votes: 10, flag_weight: 0, gray: false, hide: false },
    observer_vote: null,
    observer_vote_for: "alice",
    ...over
  } as Entry;
}

function setup(qc: QueryClient, e: Entry) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => useEntryVote(e), { wrapper }).result;
}

describe("useEntryVote: the optimistic update", () => {
  beforeEach(() => broadcast.mockReset());

  // Item 4: a post refetch that lands during the broadcast is not overwritten
  // with a count derived from the entry captured before it.
  it("derives from the entry cached after the broadcast", async () => {
    const qc = new QueryClient();
    const before = entry();
    qc.setQueryData(entryKey, before);
    broadcast.mockImplementation(async () => {
      qc.setQueryData(entryKey, entry({ stats: { total_votes: 13, flag_weight: 0, gray: false, hide: false } }));
    });
    const hook = setup(qc, before);
    await hook.current.mutateAsync({ weight: 10000, estimated: 0 });
    expect(qc.getQueryData<Entry>(entryKey)?.stats?.total_votes).toBe(14);
  });

  // Item 3: a cached "no vote" lookup older than the entry read for the user
  // (which says voted) does not win: a re-vote does not add a vote.
  it("lets the newer of entry and lookup decide the prior vote", async () => {
    const qc = new QueryClient();
    qc.setQueryData(lookupKey, null, { updatedAt: 1_000 });
    const voted = entry({ observer_vote: { rshares: 5, percent: 10000 } });
    qc.setQueryData(entryKey, voted, { updatedAt: 2_000 });
    const hook = setup(qc, voted);
    await hook.current.mutateAsync({ weight: 5000, estimated: 0 });
    expect(qc.getQueryData<Entry>(entryKey)?.stats?.total_votes).toBe(10);
  });

  it("does not apply a vote twice when the SDK's update already did", async () => {
    const qc = new QueryClient();
    const before = entry();
    qc.setQueryData(entryKey, before);
    broadcast.mockImplementation(async () => {
      // What the SDK's vote cache update writes after the broadcast.
      qc.setQueryData(entryKey, entry({
        payout: 1.5,
        stats: { total_votes: 11, flag_weight: 0, gray: false, hide: false },
        observer_vote: { rshares: null, percent: 10000 },
      }));
      qc.setQueryData(lookupKey, { rshares: null, percent: 10000 });
    });
    const hook = setup(qc, before);
    await hook.current.mutateAsync({ weight: 10000, estimated: 0.5 });
    const after = qc.getQueryData<Entry>(entryKey);
    expect(after?.stats?.total_votes).toBe(11);
    expect(after?.payout).toBe(1.5);
  });
});

// Issue #2070: hivemind keeps a vote row once cast, so after the first vote
// the count stays put through unvote, revote and flag (chain: 1,1,1,1,1).
describe("useEntryVote: removed votes keep their row", () => {
  beforeEach(() => broadcast.mockReset());

  // A raw v2 post read for alice: normalizeEntry labels it from the observer.
  const readForAlice = (over: Partial<Entry>): Entry => {
    const { observer_vote_for: _for, ...raw } = entry(over);
    return normalizeEntry(raw, "alice") as Entry;
  };

  it("follows the chain through vote, unvote, revote, unvote, flag from 0", async () => {
    const qc = new QueryClient();
    const start = readForAlice({ stats: { total_votes: 0, flag_weight: 0, gray: false, hide: false } });
    expect(start.observer_vote_for).toBe("alice");
    qc.setQueryData(entryKey, start);
    const hook = setup(qc, start);
    const seen: number[] = [];
    for (const weight of [10000, 0, 10000, 0, -10000]) {
      await hook.current.mutateAsync({ weight, estimated: 0 });
      seen.push(qc.getQueryData<Entry>(entryKey)!.stats!.total_votes);
    }
    expect(seen).toEqual([1, 1, 1, 1, 1]);
  });

  it("keeps the count on a revote over a normalized percent-0 row", async () => {
    const qc = new QueryClient();
    const removed = readForAlice({
      stats: { total_votes: 1, flag_weight: 0, gray: false, hide: false },
      observer_vote: { rshares: 0, percent: 0 }
    });
    expect(removed.observer_vote).toEqual({ rshares: 0, percent: 0 });
    qc.setQueryData(entryKey, removed);
    const hook = setup(qc, removed);
    await hook.current.mutateAsync({ weight: 10000, estimated: 0 });
    expect(qc.getQueryData<Entry>(entryKey)?.stats?.total_votes).toBe(1);
  });
});

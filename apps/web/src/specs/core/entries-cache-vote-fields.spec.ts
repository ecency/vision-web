import { describe, expect, it, vi } from "vitest";

// The global @/utils mock lacks makeEntryPath, which the cache key needs.
vi.mock("@/utils", async () => ({
  ...(await vi.importActual("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));
import { EcencyEntriesCacheManagement } from "@/core/caches";
import type { Entry } from "@/entities";
import { QueryKeys } from "@ecency/sdk";

// Review D: vote fields must never come from an older object when newer data
// exists. getEntryQuery seeds the shared entry cache with whatever row a card
// holds (a feed row read for alice, a promoted row with a raw voter list) and
// used to spread it UNDER every refetch, so a field the refetch did not carry
// came back from the stale row.
const select = (initial: Partial<Entry>, data: Partial<Entry>) =>
  (EcencyEntriesCacheManagement.getEntryQuery(initial as Entry).select as (d: Entry) => Entry)(data as Entry);

const base = { author: "bob", permlink: "p", body: "b" };

describe("getEntryQuery select: vote fields", () => {
  it("takes the vote pair from the refetch, not from the seed row", () => {
    const out = select(
      { ...base, observer_vote: { rshares: 5, percent: 10000 }, observer_vote_for: "alice", top_votes: [] },
      { ...base, observer_vote: null, observer_vote_for: null }
    );
    expect(out.observer_vote_for).toBeNull();
    expect(out.observer_vote).toBeNull();
  });

  it("does not resurrect vote fields the refetch did not carry", () => {
    const out = select(
      {
        ...base,
        observer_vote: { rshares: 5, percent: 10000 },
        observer_vote_for: "alice",
        // Deliberate raw v1 voter list: the cache must not keep it.
        active_votes: [{ voter: "x", rshares: 1 }],
        top_votes: [{ voter: "x", rshares: 1, percent: 100 }]
      },
      { ...base }
    );
    expect(out).not.toHaveProperty("active_votes");
    expect(out).not.toHaveProperty("top_votes");
    expect(out.observer_vote_for).toBeUndefined();
  });

  it("keeps everything when the data IS the seed row (no refetch yet)", () => {
    const seed = { ...base, observer_vote: { rshares: 5, percent: 10000 }, observer_vote_for: "alice" };
    expect(select(seed, seed).observer_vote_for).toBe("alice");
  });
});

// Round 4, item 4: the web's optimistic vote write also tells the SDK, so a
// lookup that lags the chain does not flip the vote back.
import { renderHook } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

describe("useUpdateVotes", () => {
  it("records the vote as this client's optimistic vote", async () => {
    const sdk = await import("@ecency/sdk");
    const qc = new QueryClient();
    const entry = { ...base, stats: { total_votes: 1, flag_weight: 0, gray: false, hide: false } } as Entry;
    qc.setQueryData(QueryKeys.posts.entry("/@bob/p"), entry);
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => EcencyEntriesCacheManagement.useUpdateVotes(entry), { wrapper });
    result.current.update({ voter: "alice", observerVote: { rshares: 1, percent: 100 }, payout: 1, totalVotes: 2 });
    expect(vi.mocked(sdk.recordOptimisticVote)).toHaveBeenCalledWith("bob", "p", "alice", { rshares: 1, percent: 100 });
  });
});

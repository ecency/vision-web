import { vi } from "vitest";
import React from "react";
import "@testing-library/jest-dom";
import { renderWithQueryClient, mockEntry } from "@/specs/test-utils";

// Issue #2056: a feed page read through bridge v2 has no voter lists. The
// count is stats.total_votes and the "you voted" heart is the observer's vote.
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: vi.fn(() => ({
    activeUser: { username: "alice" },
    username: "alice",
    account: null,
    isLoading: false,
    isPending: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn()
  }))
}));

vi.mock("@/core/caches", () => ({
  EcencyEntriesCacheManagement: {
    getEntryQuery: (initialEntry: any) => ({
      queryKey: ["entry", initialEntry?.author, initialEntry?.permlink],
      queryFn: () => initialEntry,
      initialData: initialEntry,
      enabled: !!initialEntry
    })
  }
}));

vi.mock("@/features/shared/entry-votes/entry-votes-dialog", () => ({
  EntryVotesDialog: () => null
}));

import { EntryVotes } from "@/features/shared/entry-votes";

function v2Row(permlink: string, total: number, aliceVoted: boolean) {
  const e = mockEntry({
    author: "bob",
    permlink,
    stats: { flag_weight: 0, gray: false, hide: false, total_votes: total },
    observer_vote: aliceVoted ? { rshares: 5, percent: 10000 } : null,
    observer_vote_for: "alice",
    // A feed row may still carry a stale net_votes; the count must not use it.
    net_votes: total - 7
  } as any);
  delete (e as any).active_votes;
  return e;
}

describe("EntryVotes on a v2 feed page", () => {
  it("shows stats.total_votes for every row and the user's vote from observer_vote", () => {
    const page = [v2Row("p1", 1059, true), v2Row("p2", 12, false), v2Row("p3", 1, true)];
    const { container } = renderWithQueryClient(
      <div>
        {page.map((e) => (
          <EntryVotes key={e.permlink} entry={e} />
        ))}
      </div>
    );

    const counts = [...container.querySelectorAll(".entry-votes__count")].map((n) => n.textContent);
    expect(counts).toEqual(["1059", "12", "1"]);
    const hearts = [...container.querySelectorAll(".heart-icon")].map((n) =>
      n.classList.contains("voted")
    );
    expect(hearts).toEqual([true, false, true]);
  });
});

import { vi } from "vitest";
import React from "react";
import { fireEvent, screen, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryKeys } from "@ecency/sdk";
import { renderWithQueryClient, mockEntry } from "@/specs/test-utils";

// PR review, item 2: a tap before the viewer's vote lookup answered treated
// it as "not voted" and could raise or replace an existing vote instead of
// removing it. The button waits (disabled, aria-busy) until the vote is known.
const vote = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: { username: "alice" }, username: "alice" })
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
vi.mock("@/api/mutations", () => ({ useEntryVote: () => ({ mutateAsync: vote, isPending: false }) }));

import { ReelVoteButton } from "@/app/waves/_components/reel-vote-button";

const reel = (permlink: string, over: Record<string, unknown> = {}) => {
  const e = mockEntry({
    author: "bob",
    permlink,
    stats: { flag_weight: 0, gray: false, hide: false, total_votes: 3 },
    observer_vote: null,
    observer_vote_for: "ecency",
    ...over
  } as never);
  return e;
};

describe("ReelVoteButton", () => {
  let answer: (v: unknown) => void = () => {};
  beforeEach(async () => {
    vote.mockClear();
    const sdk = await import("@ecency/sdk");
    vi.mocked(sdk.getEntryVoteQueryOptions).mockImplementation(((author?: string, permlink?: string, voter?: string, enabled = true) => ({
      queryKey: QueryKeys.posts.entryVote(author, permlink, voter),
      queryFn: () => new Promise((r) => (answer = r)),
      enabled: enabled && !!author && !!permlink && !!voter,
      retry: false
    })) as never);
  });

  it("takes no tap while the viewer's vote is being looked up, then removes the vote it finds", async () => {
    renderWithQueryClient(<ReelVoteButton entry={reel("early")} />);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    fireEvent.click(button);
    expect(vote).not.toHaveBeenCalled();

    await act(async () => answer({ rshares: 5, percent: 10000 }));
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(vote).toHaveBeenCalledWith({ weight: 0, estimated: 0 }));
  });

  // PR review, item 6: 0 is a count, not "absent".
  it("shows a zero stats.total_votes as 0, not a legacy count", () => {
    renderWithQueryClient(
      <ReelVoteButton entry={reel("zero", { stats: { flag_weight: 0, gray: false, hide: false, total_votes: 0 }, net_votes: 1, observer_vote_for: "alice" })} />
    );
    expect(screen.getByRole("button")).toHaveTextContent("0");
    expect(screen.getByRole("button")).not.toHaveTextContent("1");
  });
});

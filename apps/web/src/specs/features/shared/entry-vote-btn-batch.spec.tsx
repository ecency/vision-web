import { vi } from "vitest";
import React from "react";
import { screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { renderWithQueryClient, mockEntry } from "@/specs/test-utils";

// Review B: a profile, community or waves page renders ~20 cards read for the
// default observer, so the logged-in user's vote is looked up per card. With
// the SDK's real lookup (the built package, not a stub) those lookups must go
// out as ONE HTTP request.
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: vi.fn(() => ({ activeUser: { username: "alice" }, username: "alice" }))
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
vi.mock("@/api/mutations", () => ({
  useEntryVote: () => ({ mutateAsync: vi.fn(), isPending: false })
}));

import { EntryVoteBtn } from "@/features/shared/entry-vote-btn";

describe("EntryVoteBtn: a page of cards looks the user's votes up in one request", () => {
  afterEach(() => vi.restoreAllMocks());

  it("20 cards read for the default observer cost one HTTP request", async () => {
    const real = await vi.importActual<Record<string, any>>("@ecency/sdk");
    real.hiveTxConfig.nodes = ["https://batch-node.test"];
    const sdk = await import("@ecency/sdk");
    vi.mocked(sdk.getEntryVoteQueryOptions).mockImplementation(real.getEntryVoteQueryOptions);

    const bodies: any[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input: any, init: any) => {
      const body = JSON.parse(String(init.body));
      bodies.push(body);
      const answer = body.map((req: any) => {
        const [author, permlink, voter] = req.params.start;
        const voted = Number(permlink.slice(1)) % 2 === 0;
        return {
          jsonrpc: "2.0",
          id: req.id,
          result: {
            votes: [{ voter: voted ? voter : "zz", author, permlink, rshares: 5, vote_percent: 10000 }]
          }
        };
      });
      return new Response(JSON.stringify(answer), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    const cards = Array.from({ length: 20 }, (_, i) => {
      const e = mockEntry({
        author: "bob",
        permlink: `p${i}`,
        post_id: 5000 + i,
        stats: { flag_weight: 0, gray: false, hide: false, total_votes: 3 },
        observer_vote: { rshares: 1, percent: 10000 },
        observer_vote_for: "ecency"
      } as any);
      Reflect.deleteProperty(e, "active_votes");
      return e;
    });

    renderWithQueryClient(
      <div>
        {cards.map((e) => (
          <EntryVoteBtn key={e.permlink} entry={e} isPostSlider={false} />
        ))}
      </div>
    );

    await waitFor(() =>
      expect(screen.getAllByRole("button").filter((b) => b.getAttribute("aria-pressed") !== null)).toHaveLength(20)
    );
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toHaveLength(20);
    const pressed = screen.getAllByRole("button").map((b) => b.getAttribute("aria-pressed"));
    expect(pressed.filter((p) => p === "true")).toHaveLength(10);
  });
});

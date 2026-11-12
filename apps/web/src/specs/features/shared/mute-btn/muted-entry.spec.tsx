import { vi } from "vitest";
import React from "react";
import "@testing-library/jest-dom";
import { renderWithQueryClient, mockEntry } from "@/specs/test-utils";

// PR delta review, item 2: muting must not invent stats.total_votes. A waves
// row carries its count as net_votes and no stats; a made-up total_votes of 0
// would now win over it (the count reads stats.total_votes first).
vi.mock("@/core/caches", () => ({
  EcencyEntriesCacheManagement: {
    getEntryQuery: (initialEntry: unknown) => ({
      queryKey: ["entry-under-test"],
      queryFn: () => initialEntry,
      initialData: initialEntry,
      enabled: true
    })
  }
}));
vi.mock("@/features/shared/entry-votes/entry-votes-dialog", () => ({ EntryVotesDialog: () => null }));

import { mutedEntry } from "@/features/shared/mute-btn";
import { EntryVotes } from "@/features/shared/entry-votes";

describe("mutedEntry", () => {
  const wavesRow = () => {
    const e = mockEntry({ author: "bob", permlink: "wave", net_votes: 4 });
    Reflect.deleteProperty(e, "stats");
    Reflect.deleteProperty(e, "active_votes");
    return e;
  };

  it("marks the row gray without inventing a vote count", () => {
    const muted = mutedEntry(wavesRow(), true);
    expect(muted.stats?.gray).toBe(true);
    expect(muted.stats).not.toHaveProperty("total_votes");
  });

  it("still shows the row's own count (net_votes 4) after muting", () => {
    const { container } = renderWithQueryClient(<EntryVotes entry={mutedEntry(wavesRow(), true)} />);
    expect(container.querySelector(".entry-votes__count")).toHaveTextContent("4");
  });

  it("keeps an existing count", () => {
    const e = mockEntry({ stats: { flag_weight: 0, gray: false, hide: false, total_votes: 9 } });
    expect(mutedEntry(e, true).stats?.total_votes).toBe(9);
  });
});

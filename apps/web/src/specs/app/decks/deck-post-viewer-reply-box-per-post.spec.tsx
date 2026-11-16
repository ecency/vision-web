import { vi, describe, it, expect } from "vitest";
import React, { useEffect } from "react";
import "@testing-library/jest-dom";
import { renderWithQueryClient, mockEntry } from "@/specs/test-utils";
import type { Entry } from "@/entities";

// The reply box holds the post's failed reply in state: a viewer reused for
// another post must give that post a fresh box, so a failure (and its declined
// payout) never follows the reader to a different post.
const mounts: string[] = [];
vi.mock("@/utils", async () => ({ ...(await vi.importActual<object>("@/utils")) }));
vi.mock("@/app/decks/_components/columns/content-viewer/deck-post-viewer-comment-box", () => ({
  DeckPostViewerCommentBox: ({ entry }: { entry: Entry }) => {
    useEffect(() => {
      mounts.push(entry.permlink);
    }, []);
    return null;
  }
}));
vi.mock("@/features/shared", () => ({
  EntryInfo: () => null,
  EntryTipBtn: () => null,
  EntryVoteBtn: () => null,
  EntryVotes: () => null,
  PostContentRenderer: () => null
}));
vi.mock("@/features/shared/discussion", () => ({ Discussion: () => null }));
vi.mock("@/core/caches", () => ({
  EcencyEntriesCacheManagement: {
    getEntryQuery: (e: Entry) => ({
      queryKey: ["entry", e.author, e.permlink],
      queryFn: () => e,
      initialData: e
    })
  }
}));

import { DeckPostViewer } from "@/app/decks/_components/columns/content-viewer/deck-post-viewer";

describe("DeckPostViewer reply box", () => {
  it("mounts a fresh reply box when the viewer moves to another post", () => {
    const first = mockEntry({ author: "alice", permlink: "post-1" });
    const second = mockEntry({ author: "alice", permlink: "post-2" });

    const view = renderWithQueryClient(<DeckPostViewer entry={first} onClose={() => {}} />);
    view.rerender(<DeckPostViewer entry={second} onClose={() => {}} />);

    expect(mounts).toEqual(["post-1", "post-2"]);
  });
});

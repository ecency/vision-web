import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Entry } from "@/entities";
import { mockEntry } from "@/specs/test-utils";

// DiscussionList only touches these two SDK queries; keep them local so the
// spec doesn't depend on the global SDK mock exporting them.
vi.mock("@ecency/sdk", () => ({
  getMutedUsersQueryOptions: (username?: string) => ({
    queryKey: ["muted-users", username],
    queryFn: async () => []
  }),
  getBotsQueryOptions: () => ({ queryKey: ["bots"], queryFn: async () => [] })
}));

// The item itself renders the whole comment chrome (votes, payout, composer).
// Stub it down to its author so the assertions are about which comments the
// list decides to render.
vi.mock("@/features/shared/discussion/discussion-item", async () => {
  const Real = await import("react");
  return {
    DiscussionItem: ({ entry }: { entry: Entry }) =>
      Real.createElement("div", { "data-testid": "discussion-item" }, entry.author)
  };
});

import { DiscussionList } from "@/features/shared/discussion/discussion-list";

const root = mockEntry({ author: "bob", permlink: "the-post" });

// `bridge.get_discussion` returns no `post_id` — mockEntry's default would hide
// the regression, so drop it the way the real API does.
function comment(author: string, reputation: number): Entry {
  return {
    ...mockEntry({
      author,
      permlink: `re-the-post-${author}`,
      parent_author: "bob",
      parent_permlink: "the-post",
      depth: 1,
      author_reputation: reputation
    }),
    post_id: undefined as unknown as number
  };
}

function renderList(discussionList: Entry[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DiscussionList
        root={root}
        parent={root}
        discussionList={discussionList}
        community={null}
        hideControls={false}
        isRawContent={false}
      />
    </QueryClientProvider>
  );
}

describe("DiscussionList", () => {
  it("keeps the normal comments visible when one commenter has negative reputation", () => {
    renderList([comment("alice", 60), comment("carol", 55), comment("spammer", -8)]);

    const authors = screen.getAllByTestId("discussion-item").map((el) => el.textContent);
    expect(authors).toEqual(["alice", "carol"]);
    expect(authors).not.toContain("spammer");

    // The low-reputation reply is offered behind the reveal prompt.
    expect(screen.getByText("discussion.reveal-muted-long-description")).toBeInTheDocument();
  });

  it("appends the hidden comment on reveal instead of replacing the list", () => {
    renderList([comment("alice", 60), comment("carol", 55), comment("spammer", -8)]);

    fireEvent.click(screen.getByText("g.show"));

    expect(screen.getAllByTestId("discussion-item").map((el) => el.textContent)).toEqual([
      "alice",
      "carol",
      "spammer"
    ]);
  });

  it("renders every comment when none of them are hidden", () => {
    renderList([comment("alice", 60), comment("carol", 55)]);

    expect(screen.getAllByTestId("discussion-item")).toHaveLength(2);
    expect(screen.queryByText("discussion.reveal-muted-long-description")).not.toBeInTheDocument();
  });
});

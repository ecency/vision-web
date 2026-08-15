import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import type { Entry } from "@/entities";
import { mockEntry, renderWithQueryClient } from "@/specs/test-utils";

// DiscussionList only touches these two SDK queries; keep them local so the
// spec doesn't depend on the global SDK mock exporting them. Keys come from the
// SDK's own builders (the module is dependency-free) so the mocked queries land
// on the same cache keys production uses.
vi.mock("@ecency/sdk", async () => {
  const { QueryKeys } = await vi.importActual<typeof import("@ecency/sdk")>(
    "../../../../../../packages/sdk/src/modules/core/query-keys"
  );
  return {
    QueryKeys,
    getMutedUsersQueryOptions: vi.fn((username: string) => ({
      queryKey: QueryKeys.accounts.mutedUsers(username),
      queryFn: async () => []
    })),
    getBotsQueryOptions: vi.fn(() => ({
      queryKey: QueryKeys.accounts.bots(),
      queryFn: async () => []
    }))
  };
});

// The item itself renders the whole comment chrome (votes, payout, composer).
// Stub it down to a labelled landmark carrying its author, so the assertions
// read the rendered comments by role instead of the stub's markup.
vi.mock("@/features/shared/discussion/discussion-item", async () => {
  const Real = await import("react");
  return {
    DiscussionItem: ({ entry }: { entry: Entry }) =>
      Real.createElement("article", { "aria-label": entry.author }, entry.author)
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
  return renderWithQueryClient(
    <DiscussionList
      root={root}
      parent={root}
      discussionList={discussionList}
      community={null}
      hideControls={false}
      isRawContent={false}
    />
  );
}

// The rendered comments, in the order the list decided to show them.
function renderedAuthors() {
  return screen.getAllByRole("article").map((el) => el.getAttribute("aria-label"));
}

describe("DiscussionList", () => {
  it("keeps the normal comments visible when one commenter has negative reputation", () => {
    renderList([comment("alice", 60), comment("carol", 55), comment("spammer", -8)]);

    expect(renderedAuthors()).toEqual(["alice", "carol"]);
    expect(screen.queryByText("spammer")).not.toBeInTheDocument();

    // The low-reputation reply is offered behind the reveal prompt.
    expect(screen.getByText("discussion.reveal-muted-long-description")).toBeInTheDocument();
  });

  it("appends the hidden comment on reveal instead of replacing the list", () => {
    renderList([comment("alice", 60), comment("carol", 55), comment("spammer", -8)]);

    fireEvent.click(screen.getByText("g.show"));

    expect(renderedAuthors()).toEqual(["alice", "carol", "spammer"]);
  });

  it("renders every comment when none of them are hidden", () => {
    renderList([comment("alice", 60), comment("carol", 55)]);

    expect(renderedAuthors()).toEqual(["alice", "carol"]);
    expect(screen.queryByText("discussion.reveal-muted-long-description")).not.toBeInTheDocument();
  });
});

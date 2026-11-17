import { vi, describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { mockEntry } from "@/specs/test-utils";
import type { CommentSubmitOptions } from "@/features/shared/comment";

// #2109: with no signed-in account data yet, the deck reply box must refuse the
// submit (reject) instead of resolving without sending. The composer treats a
// resolved onSubmit as posted and clears the text and its stored draft.
const state = vi.hoisted(() => ({
  account: null as null | { name: string },
  username: "alice" as string | undefined,
  onSubmit: undefined as undefined | ((t: string, o: CommentSubmitOptions) => Promise<unknown>),
  mutateAsync: vi.fn()
}));

vi.mock("@/core/hooks", () => ({
  useActiveAccount: () => ({ username: state.username, account: state.account })
}));
vi.mock("@/api/mutations", () => ({
  useCreateReply: () => ({ mutateAsync: state.mutateAsync })
}));
vi.mock("@/utils", () => ({
  createReplyPermlink: () => "re-alice-1",
  makeJsonMetaDataReply: () => ({})
}));
vi.mock("@/features/shared/comment", () => ({
  Comment: ({ onSubmit }: { onSubmit: typeof state.onSubmit }) => {
    state.onSubmit = onSubmit;
    return null;
  }
}));

import { DeckPostViewerCommentBox } from "@/app/decks/_components/columns/content-viewer/deck-post-viewer-comment-box";

describe("DeckPostViewerCommentBox without account data", () => {
  beforeEach(() => {
    state.mutateAsync.mockReset();
    state.onSubmit = undefined;
  });

  it("rejects the submit and sends nothing while the account is not loaded", async () => {
    state.username = "alice";
    state.account = null;
    render(<DeckPostViewerCommentBox entry={mockEntry({ author: "bob", permlink: "p" })} onReplied={() => {}} />);

    await expect(state.onSubmit!("hello", { declinePayout: false })).rejects.toThrow();
    expect(state.mutateAsync).not.toHaveBeenCalled();
  });

  it("rejects the submit when nobody is signed in", async () => {
    state.username = undefined;
    state.account = null;
    render(<DeckPostViewerCommentBox entry={mockEntry({ author: "bob", permlink: "p" })} onReplied={() => {}} />);

    await expect(state.onSubmit!("hello", { declinePayout: false })).rejects.toThrow();
    expect(state.mutateAsync).not.toHaveBeenCalled();
  });

  it("sends the reply once the account has loaded", async () => {
    state.username = "alice";
    state.account = { name: "alice" };
    state.mutateAsync.mockResolvedValue(undefined);
    render(<DeckPostViewerCommentBox entry={mockEntry({ author: "bob", permlink: "p" })} onReplied={() => {}} />);

    await state.onSubmit!("hello", { declinePayout: true });
    expect(state.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ text: "hello", declinePayout: true }));
  });
});

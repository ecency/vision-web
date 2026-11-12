import { vi } from "vitest";
import React from "react";
import { fireEvent, screen, waitFor, within, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { onlineManager } from "@tanstack/react-query";
import { renderWithQueryClient, mockEntry, createTestQueryClient } from "@/specs/test-utils";

// Round 4, item 3: a click while the user's vote is still being looked up
// queues the slider to open once the vote is known. The queue is ONE slot app
// wide, expires, and is cancelled by anything that means "not that any more".
const account = vi.hoisted(() => ({ user: { username: "alice" } as { username: string } | null }));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: account.user, username: account.user?.username ?? null })
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
vi.mock("@/api/mutations", () => ({ useEntryVote: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock("@/features/shared/entry-vote-btn/entry-vote-dialog", () => ({
  EntryVoteDialog: ({ upVoted }: { upVoted: boolean }) => (
    <div data-testid="vote-dialog" data-up={String(upVoted)} />
  )
}));

import { EntryVoteBtn } from "@/features/shared/entry-vote-btn";
import { queuedOpenOwner } from "@/features/shared/entry-vote-btn/queued-open";

const answers = new Map<string, (v: unknown) => void>();

beforeEach(async () => {
  account.user = { username: "alice" };
  answers.clear();
  window.sessionStorage.clear();
  const sdk = await import("@ecency/sdk");
  vi.mocked(sdk.getEntryVoteQueryOptions).mockImplementation(((author?: string, permlink?: string, voter?: string, enabled = true) => ({
    queryKey: ["posts", "entry-vote", author, permlink, voter],
    queryFn: () => new Promise((r) => answers.set(permlink!, r)),
    enabled: enabled && !!author && !!permlink && !!voter,
    retry: false
  })) as any);
});
afterEach(() => {
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
});

const card = (permlink: string, observerFor = "ecency", vote: unknown = null) => {
  const e = mockEntry({
    author: "bob",
    permlink,
    stats: { flag_weight: 0, gray: false, hide: false, total_votes: 3 },
    observer_vote: vote,
    observer_vote_for: observerFor
  } as any);
  Reflect.deleteProperty(e, "active_votes");
  return e;
};

const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));

describe("EntryVoteBtn: the queued open", () => {
  it("keeps one queued open app-wide: a newer click on another card replaces it", async () => {
    const a = renderWithQueryClient(<EntryVoteBtn entry={card("qa")} isPostSlider={false} />);
    const b = renderWithQueryClient(<EntryVoteBtn entry={card("qb")} isPostSlider={false} />);
    fireEvent.click(within(a.container).getByRole("button"));
    fireEvent.click(within(b.container).getByRole("button"));
    await waitFor(() => expect(answers.size).toBe(2));
    await act(async () => {
      answers.get("qa")!(null);
      answers.get("qb")!(null);
    });
    await settle();
    expect(within(a.container).queryByTestId("vote-dialog")).toBeNull();
    expect(within(b.container).getByTestId("vote-dialog")).toBeInTheDocument();
  });

  it("expires a queued open after 3 s", async () => {
    renderWithQueryClient(<EntryVoteBtn entry={card("qexp")} isPostSlider={false} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(answers.has("qexp")).toBe(true));
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 3_001);
    await act(async () => answers.get("qexp")!(null));
    await settle();
    expect(screen.queryByTestId("vote-dialog")).toBeNull();
  });

  it("cancels on scroll", async () => {
    renderWithQueryClient(<EntryVoteBtn entry={card("qscroll")} isPostSlider={false} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(answers.has("qscroll")).toBe(true));
    fireEvent.scroll(window);
    await act(async () => answers.get("qscroll")!(null));
    await settle();
    expect(screen.queryByTestId("vote-dialog")).toBeNull();
  });

  it("cancels on a click elsewhere", async () => {
    renderWithQueryClient(<EntryVoteBtn entry={card("qelse")} isPostSlider={false} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(answers.has("qelse")).toBe(true));
    fireEvent.mouseDown(document.body);
    await act(async () => answers.get("qelse")!(null));
    await settle();
    expect(screen.queryByTestId("vote-dialog")).toBeNull();
  });

  it("cancels on unmount", async () => {
    const r = renderWithQueryClient(<EntryVoteBtn entry={card("qunmount")} isPostSlider={false} />);
    fireEvent.click(screen.getByRole("button"));
    expect(queuedOpenOwner()).not.toBeNull();
    r.unmount();
    expect(queuedOpenOwner()).toBeNull();
  });

  it("cancels on logout", async () => {
    const r = renderWithQueryClient(<EntryVoteBtn entry={card("qlogout")} isPostSlider={false} />);
    fireEvent.click(screen.getByRole("button"));
    expect(queuedOpenOwner()).not.toBeNull();
    account.user = null;
    r.rerender(<EntryVoteBtn entry={card("qlogout")} isPostSlider={false} />);
    expect(queuedOpenOwner()).toBeNull();
  });

  // PR review, item 5: a queued open belongs to the user who clicked.
  it("cancels on a direct account switch (alice to bob)", async () => {
    const r = renderWithQueryClient(<EntryVoteBtn entry={card("qswitch")} isPostSlider={false} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(answers.has("qswitch")).toBe(true));
    account.user = { username: "bob" };
    r.rerender(<EntryVoteBtn entry={card("qswitch")} isPostSlider={false} />);
    expect(queuedOpenOwner()).toBeNull();
    // Bob's own lookup answers: no slider opens without a click of his.
    await waitFor(() => expect(answers.has("qswitch")).toBe(true));
    await act(async () => answers.get("qswitch")!(null));
    await settle();
    expect(screen.queryByTestId("vote-dialog")).toBeNull();
  });

  it("does not hand a queued open to another user even if the slot is still held", async () => {
    const { queueOpen, takeQueuedOpen } = await import("@/features/shared/entry-vote-btn/queued-open");
    queueOpen("owner-x", "alice");
    expect(takeQueuedOpen("owner-x", "bob")).toBe(false);
    expect(queuedOpenOwner()).toBeNull();
    queueOpen("owner-x", "alice");
    expect(takeQueuedOpen("owner-x", undefined)).toBe(false);
  });

  it("does not scroll a late (queued) open into view; a direct open does", async () => {
    const scroll = vi.fn();
    (HTMLElement.prototype as any).scrollIntoView = scroll;
    renderWithQueryClient(<EntryVoteBtn entry={card("qlate")} isPostSlider={false} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(answers.has("qlate")).toBe(true));
    await act(async () => answers.get("qlate")!(null));
    await screen.findByTestId("vote-dialog");
    expect(scroll).not.toHaveBeenCalled();

    // Close, then open again with the vote known: a direct open scrolls.
    fireEvent.click(screen.getAllByRole("button")[0]);
    await waitFor(() => expect(screen.queryByTestId("vote-dialog")).toBeNull());
    fireEvent.click(screen.getAllByRole("button")[0]);
    await screen.findByTestId("vote-dialog");
    expect(scroll).toHaveBeenCalled();
    delete (HTMLElement.prototype as any).scrollIntoView;
  });

  it("closes an open slider from its trigger even while the vote is pending", async () => {
    const qc = createTestQueryClient();
    const r = renderWithQueryClient(<EntryVoteBtn entry={card("qclose", "alice", null)} isPostSlider={false} />, { queryClient: qc });
    fireEvent.click(screen.getAllByRole("button")[0]);
    await screen.findByTestId("vote-dialog");
    // The same post, now read for the default observer: alice's vote is pending.
    r.rerender(<EntryVoteBtn entry={card("qclose-2")} isPostSlider={false} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    await waitFor(() => expect(screen.queryByTestId("vote-dialog")).toBeNull());
  });

  it("is never pending while offline: the click opens as not voted", async () => {
    onlineManager.setOnline(false);
    renderWithQueryClient(<EntryVoteBtn entry={card("qoffline")} isPostSlider={false} />);
    await settle();
    const button = screen.getByRole("button");
    expect(button).not.toHaveAttribute("aria-busy");
    fireEvent.click(button);
    expect(await screen.findByTestId("vote-dialog")).toHaveAttribute("data-up", "false");
  });
});

// Round 5, item 5: the queue slot is read per button (is it mine?), so a
// queue event re-renders only the buttons whose answer changed.
describe("EntryVoteBtn: queue events re-render only the buttons they concern", () => {
  it("does not re-render an unrelated button when another card queues", async () => {
    let otherRenders = 0;
    const a = renderWithQueryClient(<EntryVoteBtn entry={card("rr-a")} isPostSlider={false} />);
    renderWithQueryClient(
      <React.Profiler id="other" onRender={() => (otherRenders += 1)}>
        <EntryVoteBtn entry={card("rr-b")} isPostSlider={false} />
      </React.Profiler>
    );
    await settle();
    const before = otherRenders;
    fireEvent.click(within(a.container).getByRole("button"));
    await settle();
    expect(otherRenders).toBe(before);
  });
});

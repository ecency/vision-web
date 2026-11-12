import { vi } from "vitest";
import React from "react";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { renderWithQueryClient, mockEntry, createTestQueryClient } from "@/specs/test-utils";

// Log a user in so LoginRequired renders the button and the vote slider can mount.
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

// The component reads its entry through EcencyEntriesCacheManagement.getEntryQuery.
// Stub it to a plain query whose initialData is the passed entry (renders sync, no network).
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

// prepareVotes() reads parseAsset/parseDate from the globally-mocked @/utils; pass the
// fetched votes straight through so the test doesn't depend on those internals.
vi.mock("@/features/shared/entry-vote-btn/utils", async () => ({
  prepareVotes: (_entry: any, votes: any[]) => votes,
  // The real per-post session key (author/permlink).
  ...(await vi.importActual<Record<string, unknown>>(
    "@/features/shared/entry-vote-btn/utils/vote-value-key"
  ))
}));

// The slider dialog is loaded via next/dynamic and pulls in SDK vote-value queries we
// don't exercise here. Replace it with a marker that records the previousVotedValue prop
// it receives, so we can assert (a) it mounts and (b) the resolved value reaches it.
// The extra button forwards to the dialog's onClick (the vote handler) so tests can
// drive a successful vote broadcast.
vi.mock("@/features/shared/entry-vote-btn/entry-vote-dialog", () => ({
  EntryVoteDialog: ({
    previousVotedValue,
    onClick
  }: {
    previousVotedValue: number | undefined;
    onClick: (percent: number, estimated: number) => void;
  }) => (
    <div data-testid="vote-dialog">
      prev:{previousVotedValue === undefined ? "none" : previousVotedValue}
      {/* span, not <button>: pre-existing tests query the single role=button control */}
      <span data-testid="vote-now" onClick={() => onClick(100, 0.5)} />
    </div>
  )
}));

import { EntryVoteBtn } from "@/features/shared/entry-vote-btn";

describe("EntryVoteBtn — opening the slider is not blocked on the previous-vote fetch (INP)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });
  afterEach(() => vi.clearAllMocks());

  it("opens the slider while the previous-vote fetch is still pending, then forwards the resolved value", async () => {
    // An already-upvoted post: opening the slider takes getPreviousVote()'s network
    // branch (session-cache miss -> queryClient.fetchQuery for the prior vote weight).
    const entry = mockEntry({
      author: "bob",
      permlink: "a-post",
      post_id: 999,
      observer_vote: { rshares: 100, percent: null },
      observer_vote_for: "alice"
    });

    const queryClient = createTestQueryClient();
    // Hold the previous-vote fetch open so we can prove the dialog opens before it resolves.
    let resolveFetch: (v: any) => void = () => {};
    const fetchPromise = new Promise((res) => (resolveFetch = res));
    const fetchSpy = vi.spyOn(queryClient, "fetchQuery").mockReturnValue(fetchPromise as any);

    renderWithQueryClient(<EntryVoteBtn entry={entry} isPostSlider={true} />, { queryClient });

    // Open the slider.
    fireEvent.click(screen.getByRole("button"));

    // The slider appears even though the previous-vote fetch is still pending — i.e. the
    // open did NOT await the network call. That await used to block the open and inflate INP.
    const dialog = await screen.findByTestId("vote-dialog");
    expect(dialog).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(dialog).toHaveTextContent("prev:none"); // value not resolved yet

    // Once the lookup of alice's own vote resolves, its weight (75%) reaches the slider.
    resolveFetch({ rshares: 100, percent: 7500 });
    await waitFor(() => expect(screen.getByTestId("vote-dialog").textContent).toBe("prev:75"));
  });

  it("toggles the slider closed on a second click", async () => {
    const entry = mockEntry({ author: "bob", permlink: "b-post", post_id: 1000, observer_vote: null, observer_vote_for: "alice" } as any);
    renderWithQueryClient(<EntryVoteBtn entry={entry} isPostSlider={true} />);

    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByTestId("vote-dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.queryByTestId("vote-dialog")).not.toBeInTheDocument());
  });

  it("does not seed a reused button's slider with the previous post's vote", async () => {
    const entryA = mockEntry({
      author: "bob",
      permlink: "a",
      post_id: 1,
      observer_vote: { rshares: 100, percent: null },
      observer_vote_for: "alice"
    });
    const entryB = mockEntry({
      author: "carol",
      permlink: "b",
      post_id: 2,
      observer_vote: { rshares: 50, percent: null },
      observer_vote_for: "alice"
    });

    const queryClient = createTestQueryClient();
    // First open (A) resolves to 75%; the second open (B) stays pending so that any
    // leaked value would have to come from A's cached previousVotedValue, not B's fetch.
    let calls = 0;
    let resolveA: (v: any) => void = () => {};
    vi.spyOn(queryClient, "fetchQuery").mockImplementation((() => {
      calls += 1;
      if (calls === 1) return new Promise((res) => (resolveA = res));
      return new Promise(() => {});
    }) as any);

    const utils = renderWithQueryClient(<EntryVoteBtn entry={entryA} isPostSlider={true} />, {
      queryClient
    });

    fireEvent.click(screen.getByRole("button"));
    await screen.findByTestId("vote-dialog");
    resolveA({ rshares: 100, percent: 7500 });
    await waitFor(() => expect(screen.getByTestId("vote-dialog").textContent).toBe("prev:75"));

    // Close, then reuse the SAME button instance for a different post.
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.queryByTestId("vote-dialog")).not.toBeInTheDocument());
    utils.rerender(<EntryVoteBtn entry={entryB} isPostSlider={true} />);

    // Open B (its fetch is pending): the slider must not be seeded with A's 75%.
    fireEvent.click(screen.getByRole("button"));
    const dialogB = await screen.findByTestId("vote-dialog");
    expect(dialogB).toHaveTextContent("prev:none");
  });
});

describe("EntryVoteBtn — success pulse (transient class, never on load)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });
  afterEach(() => vi.clearAllMocks());

  it("does not pulse the chevron for an already-voted post on initial render", () => {
    const entry = mockEntry({
      author: "bob",
      permlink: "voted-post",
      post_id: 1001,
      observer_vote: { rshares: 100, percent: null },
      observer_vote_for: "alice"
    });
    const { container } = renderWithQueryClient(<EntryVoteBtn entry={entry} isPostSlider={true} />);

    expect(container.querySelector(".btn-inner")).not.toHaveClass("animate-success-pulse");
  });

  it("pulses the chevron after a successful vote broadcast and clears on animationend", async () => {
    const entry = mockEntry({ author: "bob", permlink: "c-post", post_id: 1002, observer_vote: null, observer_vote_for: "alice" } as any);
    const { container } = renderWithQueryClient(<EntryVoteBtn entry={entry} isPostSlider={true} />);

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(await screen.findByTestId("vote-now"));

    const chevron = container.querySelector(".btn-inner") as HTMLElement;
    await waitFor(() => expect(chevron).toHaveClass("animate-success-pulse"));
    // A successful vote also closes the slider (pre-existing behavior).
    expect(screen.queryByTestId("vote-dialog")).not.toBeInTheDocument();

    // Transient class is removed once the pulse finishes.
    fireEvent.animationEnd(chevron);
    expect(chevron).not.toHaveClass("animate-success-pulse");
  });

  it("grows the slider popover from the chevron (top-left origin)", async () => {
    const entry = mockEntry({ author: "bob", permlink: "d-post", post_id: 1003, observer_vote: null, observer_vote_for: "alice" } as any);
    const { container } = renderWithQueryClient(<EntryVoteBtn entry={entry} isPostSlider={true} />);

    fireEvent.click(screen.getByRole("button"));
    await screen.findByTestId("vote-dialog");

    const popover = container.querySelector(".tooltiptext") as HTMLElement;
    expect(popover).toHaveClass("animate-scale-in");
    expect(popover).toHaveClass("origin-top-left");
  });
});

/**
 * Dismissing the slider when it lives inside a portalled dialog. The guard that
 * protects the transfer dialog (opened from the slider itself on a paid-out
 * post) used to test "is this click inside #modal-dialog-container" — which is
 * true of EVERY click once the button itself is portalled there, as it is in
 * the curation desk's drawer. The slider could then not be dismissed at all:
 * not by clicking away, and not by its own trigger, which the panel covers.
 */
describe("EntryVoteBtn — dismissing the slider from inside a portalled dialog", () => {
  const entry = () =>
    mockEntry({ author: "bob", permlink: "in-a-drawer", post_id: 2001, observer_vote: null, observer_vote_for: "alice" } as any);

  function portalSubtree(id: string) {
    const container =
      document.getElementById("modal-dialog-container") ??
      (() => {
        const el = document.createElement("div");
        el.id = "modal-dialog-container";
        document.body.appendChild(el);
        return el;
      })();
    const subtree = document.createElement("div");
    subtree.dataset.subtree = id;
    container.appendChild(subtree);
    return subtree;
  }

  afterEach(() => {
    document.getElementById("modal-dialog-container")?.remove();
    vi.clearAllMocks();
  });

  it("closes on a click elsewhere in the dialog that hosts it", async () => {
    const drawer = portalSubtree("drawer");
    const sibling = document.createElement("button");
    sibling.textContent = "Comment";
    drawer.appendChild(sibling);
    const mount = document.createElement("div");
    drawer.appendChild(mount);

    renderWithQueryClient(<EntryVoteBtn entry={entry()} isPostSlider={true} />, {
      // Mount INSIDE the portal subtree: that is the whole point — the button
      // itself lives in the dialog, which is what the old guard could not see.
      renderOptions: { container: mount }
    });
    // By name: the hosting dialog has controls of its own in these tests.
    fireEvent.click(screen.getByRole("button", { name: "entry-vote-btn.vote" }));
    expect(await screen.findByTestId("vote-dialog")).toBeInTheDocument();

    fireEvent.mouseDown(sibling);
    await waitFor(() => expect(screen.queryByTestId("vote-dialog")).toBeNull());
  });

  it("closes on a click that lands on an icon glyph, which is an SVGElement", async () => {
    const drawer = portalSubtree("drawer");
    const glyph = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    drawer.appendChild(glyph);
    const mount = document.createElement("div");
    drawer.appendChild(mount);

    renderWithQueryClient(<EntryVoteBtn entry={entry()} isPostSlider={true} />, {
      // Mount INSIDE the portal subtree: that is the whole point — the button
      // itself lives in the dialog, which is what the old guard could not see.
      renderOptions: { container: mount }
    });
    // By name: the hosting dialog has controls of its own in these tests.
    fireEvent.click(screen.getByRole("button", { name: "entry-vote-btn.vote" }));
    expect(await screen.findByTestId("vote-dialog")).toBeInTheDocument();

    // An `instanceof HTMLElement` test is false here: SVGElement extends
    // Element, not HTMLElement, so this click used to be swallowed everywhere.
    fireEvent.mouseDown(glyph);
    await waitFor(() => expect(screen.queryByTestId("vote-dialog")).toBeNull());
  });

  it("survives a click in a dialog stacked on top of it", async () => {
    const drawer = portalSubtree("drawer");
    const mount = document.createElement("div");
    drawer.appendChild(mount);

    renderWithQueryClient(<EntryVoteBtn entry={entry()} isPostSlider={true} />, {
      // Mount INSIDE the portal subtree: that is the whole point — the button
      // itself lives in the dialog, which is what the old guard could not see.
      renderOptions: { container: mount }
    });
    // By name: the hosting dialog has controls of its own in these tests.
    fireEvent.click(screen.getByRole("button", { name: "entry-vote-btn.vote" }));
    expect(await screen.findByTestId("vote-dialog")).toBeInTheDocument();

    // The transfer dialog the slider opens for a paid-out post is its own
    // portal subtree, and it unmounts with the slider — so its clicks must not
    // close it. This is the case the original guard existed for.
    const tip = portalSubtree("tip");
    const amount = document.createElement("input");
    tip.appendChild(amount);
    fireEvent.mouseDown(amount);

    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId("vote-dialog")).toBeInTheDocument();
  });

  it("still closes on an outside click when nothing is portalled, as on the post page", async () => {
    renderWithQueryClient(<EntryVoteBtn entry={entry()} isPostSlider={true} />);
    // By name: the hosting dialog has controls of its own in these tests.
    fireEvent.click(screen.getByRole("button", { name: "entry-vote-btn.vote" }));
    expect(await screen.findByTestId("vote-dialog")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByTestId("vote-dialog")).toBeNull());
  });
});

// Issue #2056: bridge v2 entries carry the observer's vote, not every vote.
describe("EntryVoteBtn: vote state from bridge v2", () => {
  // getEntryVoteQueryOptions comes from the global @ecency/sdk mock.
  let lookup: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    window.sessionStorage.clear();
    const sdk = await import("@ecency/sdk");
    lookup = vi.fn(async () => null);
    vi.mocked(sdk.getEntryVoteQueryOptions).mockImplementation(((
      author?: string,
      permlink?: string,
      voter?: string,
      enabled = true
    ) => ({
      queryKey: ["posts", "entry-vote", author, permlink, voter],
      queryFn: () => lookup(author, permlink, voter),
      enabled: enabled && !!author && !!permlink && !!voter
    })) as any);
  });
  afterEach(() => vi.clearAllMocks());

  const pressed = () => screen.getByRole("button").getAttribute("aria-pressed");

  it("shows a vote cast beyond the first 1000 voters as cast", async () => {
    // 1059 votes: v1 active_votes stopped at 1000 and left alice out. v2 tells
    // us directly, and there is no voter list at all.
    const entry = mockEntry({
      author: "bob",
      permlink: "big-post",
      post_id: 3001,
      stats: { flag_weight: 0, gray: false, hide: false, total_votes: 1059 },
      observer_vote: { rshares: 123, percent: 10000 },
      observer_vote_for: "alice"
    } as any);
    delete (entry as any).active_votes;

    renderWithQueryClient(<EntryVoteBtn entry={entry} isPostSlider={true} />);

    expect(pressed()).toBe("true");
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "entry-vote-btn.upvoted");
    // The entry answered for alice: no lookup.
    expect(lookup).not.toHaveBeenCalled();
  });

  it("never shows the default observer's vote as the logged-in user's", async () => {
    // Server-rendered for the default observer, who voted; alice has not.
    const entry = mockEntry({
      author: "bob",
      permlink: "ssr-post",
      post_id: 3002,
      stats: { flag_weight: 0, gray: false, hide: false, total_votes: 5 },
      observer_vote: { rshares: 999, percent: 10000 },
      observer_vote_for: "ecency"
    } as any);
    delete (entry as any).active_votes;
    let answer: (v: unknown) => void = () => {};
    lookup.mockImplementation(() => new Promise((res) => (answer = res)));

    renderWithQueryClient(<EntryVoteBtn entry={entry} isPostSlider={true} />);

    // While alice's own vote is being looked up: neither voted nor "not voted".
    expect(pressed()).toBeNull();
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-label", "entry-vote-btn.upvoted");
    await waitFor(() => expect(lookup).toHaveBeenCalledWith("bob", "ssr-post", "alice"));
    answer(null);
    await waitFor(() => expect(pressed()).toBe("false"));
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
  });

  it("shows the logged-in user's own vote, looked up, on an entry read for another observer", async () => {
    const entry = mockEntry({
      author: "bob",
      permlink: "ssr-post-2",
      post_id: 3003,
      stats: { flag_weight: 0, gray: false, hide: false, total_votes: 5 },
      observer_vote: null,
      observer_vote_for: "ecency"
    } as any);
    delete (entry as any).active_votes;
    lookup.mockResolvedValue({ rshares: -50, percent: -2500 });

    renderWithQueryClient(<EntryVoteBtn entry={entry} isPostSlider={true} />);

    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveAttribute("aria-label", "entry-vote-btn.downvoted")
    );
  });

  it("seeds the slider from observer_vote.percent without loading any voter list", async () => {
    const entry = mockEntry({
      author: "bob",
      permlink: "seed-post",
      post_id: 3004,
      stats: { flag_weight: 0, gray: false, hide: false, total_votes: 1 },
      observer_vote: { rshares: 10, percent: 6000 },
      observer_vote_for: "alice"
    } as any);
    delete (entry as any).active_votes;
    const queryClient = createTestQueryClient();
    const fetchSpy = vi.spyOn(queryClient, "fetchQuery");

    renderWithQueryClient(<EntryVoteBtn entry={entry} isPostSlider={true} />, { queryClient });
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(screen.getByTestId("vote-dialog").textContent).toBe("prev:60"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// Review: lookup precedence, the session key (N).
describe("EntryVoteBtn: precedence and the session key", () => {
  beforeEach(async () => {
    window.sessionStorage.clear();
    const sdk = await import("@ecency/sdk");
    vi.mocked(sdk.getEntryVoteQueryOptions).mockImplementation(((
      author?: string,
      permlink?: string,
      voter?: string,
      enabled = true
    ) => ({
      queryKey: ["posts", "entry-vote", author, permlink, voter],
      queryFn: async () => null,
      enabled: enabled && !!author && !!permlink && !!voter,
      staleTime: Infinity
    })) as any);
  });
  afterEach(() => vi.clearAllMocks());

  it("prefers the looked-up vote over the entry's (the lookup cache is what a vote writes)", async () => {
    const entry = mockEntry({
      author: "bob",
      permlink: "both",
      stats: { flag_weight: 0, gray: false, hide: false, total_votes: 3 },
      observer_vote: null,
      observer_vote_for: "alice"
    } as any);
    delete (entry as any).active_votes;
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(["posts", "entry-vote", "bob", "both", "alice"], { rshares: 5, percent: 5000 });

    renderWithQueryClient(<EntryVoteBtn entry={entry} isPostSlider={true} />, { queryClient });

    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
  });

  it("keys the remembered slider value by author/permlink: bridge posts have no post_id", async () => {
    const mk = (permlink: string) => {
      const e = mockEntry({
        author: "bob",
        permlink,
        stats: { flag_weight: 0, gray: false, hide: false, total_votes: 1 },
        observer_vote: { rshares: 1, percent: 10000 },
        observer_vote_for: "alice"
      } as any);
      delete (e as any).active_votes;
      delete (e as any).post_id;
      return e;
    };
    // session-storage keys carry the "ecency_" prefix.
    window.sessionStorage.setItem("ecency_vote-value-up-alice-bob/first", JSON.stringify(42));

    const first = renderWithQueryClient(<EntryVoteBtn entry={mk("first")} isPostSlider={true} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByTestId("vote-dialog").textContent).toBe("prev:42"));
    first.unmount();

    // Another post must not inherit it.
    renderWithQueryClient(<EntryVoteBtn entry={mk("second")} isPostSlider={true} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByTestId("vote-dialog").textContent).toBe("prev:100"));
  });
});

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Entry } from "@/entities";
import { mockEntry } from "@/specs/test-utils";

// `@/utils` is globally mocked to only expose `random` + `getAccessToken`.
// EntryListItem (and its muted-content child) import several other helpers
// (makeEntryPath, isHiddenPost, useEntryLocation). Re-mock locally with
// importActual so those real implementations are preserved while the globally
// stubbed functions stay stubbed.
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

// `@ecency/render-helper` is not globally mocked. Stub the bits the component
// touches so nothing reaches the network / image proxy during the test.
vi.mock("@ecency/render-helper", () => ({
  setProxyBase: vi.fn(),
  postBodySummary: vi.fn((entry: any) => `summary:${entry?.permlink ?? ""}`),
  catchPostImage: vi.fn(() => ""),
  proxifyImageSrc: vi.fn(() => "")
}));

// Use the real SDK here (the global mock is a partial stand-in): the card calls
// the moderation rules during render, and this spec asserts on which reason fired.
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk"))
}));

// Mock the heavy / network-bound sibling and child components from the shared
// barrel. We keep a real-logic `EntryLink` so the title link's href is genuinely
// computed by makeEntryPath, and a real-logic `ProfileLink` so the author link
// is exercised. Everything else (votes, menu, payout, avatar, popover...) is a
// deterministic stub.
vi.mock("@/features/shared", async () => {
  const { makeEntryPath } = await vi.importActual<typeof import("@/utils/make-path")>(
    "@/utils/make-path"
  );
  const Real = await import("react");

  const EntryLink = ({ entry, children, className }: any) =>
    Real.createElement(
      "a",
      { href: makeEntryPath(entry.category, entry.author, entry.permlink), className },
      children
    );

  const ProfileLink = ({ username, children }: any) =>
    Real.createElement("a", { href: `/@${username}`, "data-testid": "profile-link" }, children);

  return {
    EntryLink,
    ProfileLink,
    EcencySourceBadge: () => null,
    UserAvatar: ({ username }: any) =>
      Real.createElement("span", { "data-testid": "user-avatar" }, username),
    ProfilePopover: () => Real.createElement("span", { "data-testid": "profile-popover" }),
    TimeLabel: ({ created }: any) =>
      Real.createElement("span", { "data-testid": "time-label" }, created),
    EntryVoteBtn: () => Real.createElement("span", { "data-testid": "entry-vote-btn" }),
    EntryPayout: ({ entry }: any) =>
      Real.createElement("span", { "data-testid": "entry-payout" }, entry.pending_payout_value),
    EntryVotes: () => Real.createElement("span", { "data-testid": "entry-votes" }),
    EntryReblogBtn: () => Real.createElement("span", { "data-testid": "entry-reblog-btn" }),
    EntryTipBtn: () => Real.createElement("span", { "data-testid": "entry-tip-btn" }),
    EntryMenu: () => Real.createElement("span", { "data-testid": "entry-menu" })
  };
});

// The tag link is rendered in the header (category / community pill).
vi.mock("@/features/shared/tag", () => ({
  TagLink: ({ children }: any) =>
    React.createElement("span", { "data-testid": "tag-link" }, children)
}));

// Child components private to entry-list-item that pull extra trees — stub them
// so the test focuses on the composite's own wiring.
vi.mock("@/features/shared/entry-list-item/entry-list-item-cross-post", () => ({
  EntryListItemCrossPost: () => null
}));
vi.mock("@/features/shared/entry-list-item/entry-list-item-client-init", () => ({
  EntryListItemClientInit: () => null
}));
vi.mock("@/features/shared/entry-list-item/entry-list-item-poll-icon", () => ({
  EntryListItemPollIcon: () => null
}));
// The thumbnail does image-downloader queries; stub it out (the title + body
// links are rendered separately by the muted-content component).
vi.mock("@/features/shared/entry-list-item/entry-list-item-thumbnail", () => ({
  EntryListItemThumbnail: () => null
}));

import { EntryListItem } from "@/features/shared/entry-list-item";

function renderItem(entry: Entry, props: Partial<React.ComponentProps<typeof EntryListItem>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EntryListItem entry={entry} order={0} {...props} />
    </QueryClientProvider>
  );
}

describe("EntryListItem", () => {
  it("renders the entry title and author", () => {
    const entry = mockEntry({
      author: "alice",
      permlink: "my-first-post",
      title: "Hello Hive World",
      category: "hive-101"
    });

    renderItem(entry);

    expect(screen.getByText("Hello Hive World")).toBeInTheDocument();
    // Author appears via the avatar stub inside the profile link.
    expect(screen.getByTestId("user-avatar")).toHaveTextContent("alice");
    expect(screen.getByTestId("profile-link")).toHaveAttribute("href", "/@alice");
  });

  it("links the title to the bare /@author/permlink canonical path (no category segment)", () => {
    const entry = mockEntry({
      author: "alice",
      permlink: "my-first-post",
      title: "Hello Hive World",
      category: "hive-101"
    });

    renderItem(entry);

    const titleLink = screen.getByText("Hello Hive World").closest("a");
    expect(titleLink).not.toBeNull();
    expect(titleLink).toHaveAttribute("href", "/@alice/my-first-post");
    // Regression guard: the leading category segment must be stripped to avoid
    // the 308 redirect hop.
    expect(titleLink?.getAttribute("href")).not.toContain("hive-101");
  });

  it("renders the post body summary text", () => {
    const entry = mockEntry({
      author: "bob",
      permlink: "another-post",
      title: "Another Post",
      // ensure no json_metadata.description short-circuit, so postBodySummary runs
      json_metadata: { tags: ["test"], app: "ecency/test" }
    });

    renderItem(entry);

    expect(screen.getByText("summary:another-post")).toBeInTheDocument();
  });

  it("renders a replies link to the entry when the post has children", () => {
    const entry = mockEntry({
      author: "carol",
      permlink: "popular-post",
      title: "Popular Post",
      category: "photography",
      children: 3
    });

    renderItem(entry);

    // The comments count link shows the children count and links to the entry.
    const repliesLink = screen
      .getAllByRole("link")
      .find((a) => a.getAttribute("href") === "/@carol/popular-post" && a.textContent?.includes("3"));
    expect(repliesLink).toBeTruthy();
  });

  it("does not render a replies link when the post has no children", () => {
    const entry = mockEntry({
      author: "dave",
      permlink: "quiet-post",
      title: "Quiet Post",
      children: 0
    });

    const { container } = renderItem(entry);

    // Only the title/body EntryLinks point at the entry; there is no extra
    // comments-count anchor containing a UilComment icon.
    const commentIcons = container.querySelectorAll("svg.w-3\\.5.h-3\\.5");
    expect(commentIcons.length).toBe(0);
  });

  it("shows the promoted badge and faq link when promoted", () => {
    const entry = mockEntry({ author: "erin", permlink: "ad-post", title: "Ad Post" });

    renderItem(entry, { promoted: true });

    const promotedLink = screen.getByText("entry-list-item.promoted").closest("a");
    expect(promotedLink).toHaveAttribute("href", "/faq#how-promotion-work");
  });

  it("renders the cross-posted ORIGINAL entry's title and links to the original post", () => {
    const original = mockEntry({
      author: "origauthor",
      permlink: "original-permlink",
      title: "The Original Title",
      category: "art"
    });
    const crossPost = mockEntry({
      author: "reposter",
      permlink: "cross-permlink",
      title: "Crosspost wrapper",
      category: "hive-art",
      original_entry: original
    });

    renderItem(crossPost as Entry);

    // For a cross-post the composite unwraps `original_entry`, so it renders the
    // ORIGINAL entry's title (not the wrapper's), and the title links to the
    // original post's bare canonical path.
    const titleNode = screen.getByText("The Original Title");
    expect(titleNode).toBeInTheDocument();
    expect(screen.queryByText("Crosspost wrapper")).not.toBeInTheDocument();
    const titleLink = titleNode.closest("a");
    expect(titleLink).toHaveAttribute("href", "/@origauthor/original-permlink");
  });

  it("defers the action bar for below-the-fold cards while keeping title + author in the markup", () => {
    const entry = mockEntry({
      author: "alice",
      permlink: "deep-post",
      title: "Deep In The Feed",
      category: "hive-1"
    });

    // order >= 2 => not the above-the-fold LCP card => action bar is deferred
    // (placeholder) until near-viewport. The IntersectionObserver stub never
    // fires, so it stays deferred for the test.
    renderItem(entry, { order: 5 });

    // SEO-critical content remains in the server markup (outside the island).
    expect(screen.getByText("Deep In The Feed")).toBeInTheDocument();
    expect(screen.getByTestId("user-avatar")).toHaveTextContent("alice");
    expect(screen.getByTestId("profile-link")).toHaveAttribute("href", "/@alice");

    // The heavy interactive cluster is NOT mounted yet.
    expect(screen.queryByTestId("entry-vote-btn")).not.toBeInTheDocument();
    expect(screen.queryByTestId("entry-menu")).not.toBeInTheDocument();
  });

  it("renders the action bar immediately for the top (order < 2) cards", () => {
    const entry = mockEntry({ author: "bob", permlink: "top-post", title: "Top Post" });

    renderItem(entry, { order: 0 });

    expect(screen.getByTestId("entry-vote-btn")).toBeInTheDocument();
    expect(screen.getByTestId("entry-menu")).toBeInTheDocument();
  });

  it("renders the tip (gift) button in the action bar — parity with the mobile tip action", () => {
    const entry = mockEntry({ author: "bob", permlink: "top-post", title: "Top Post" });

    renderItem(entry, { order: 0 });

    expect(screen.getByTestId("entry-tip-btn")).toBeInTheDocument();
  });

  it("mounts the deferred action bar when focus enters the card (keyboard backstop)", async () => {
    const entry = mockEntry({
      author: "alice",
      permlink: "deep-post",
      title: "Deep In The Feed",
      category: "hive-1"
    });

    renderItem(entry, { order: 5 });
    expect(screen.queryByTestId("entry-vote-btn")).not.toBeInTheDocument();

    // Focusing a server-rendered card link (here the author link) mounts the
    // card's deferred action bar so keyboard users reach the controls.
    fireEvent.focusIn(screen.getByTestId("profile-link"));
    await waitFor(() => expect(screen.getByTestId("entry-vote-btn")).toBeInTheDocument());
  });

  describe("moderation treatment", () => {
    it("dims a moderator-muted post behind a hint, keeping title and summary", () => {
      const entry = mockEntry({
        author: "alice",
        permlink: "gray-post",
        title: "Grayed Post",
        stats: { flag_weight: 0, gray: true, hide: false, total_votes: 2 }
      });

      renderItem(entry);

      expect(screen.getByText("g.modmuted-message")).toBeInTheDocument();
      // Nothing is hidden, only de-emphasized.
      expect(screen.getByText("Grayed Post")).toBeInTheDocument();
    });

    it("reports downvotes rather than low trust for a downvoted small account", () => {
      const entry = mockEntry({
        author: "alice",
        permlink: "downvoted-post",
        title: "Downvoted Post",
        author_reputation: 12,
        body: "buy at https://shop.example",
        net_rshares: -50000000000,
        stats: { flag_weight: 0, gray: false, hide: false, total_votes: 9 }
      });

      renderItem(entry);

      expect(screen.getByText("g.hidden-message")).toBeInTheDocument();
    });

    it("flags a low-reputation author only when the post carries an outbound link", () => {
      const promo = mockEntry({
        author: "alice",
        permlink: "promo-post",
        title: "Promo Post",
        author_reputation: 12,
        body: "buy at https://shop.example"
      });

      const { unmount } = renderItem(promo);
      expect(screen.getByText("g.lowtrust-message")).toBeInTheDocument();
      unmount();

      const diary = mockEntry({
        author: "alice",
        permlink: "diary-post",
        title: "Diary Post",
        author_reputation: 12,
        body: "just my diary, no links"
      });

      renderItem(diary);
      expect(screen.queryByText("g.lowtrust-message")).not.toBeInTheDocument();
    });

    it("clears the dim when the hint is clicked", () => {
      const entry = mockEntry({
        author: "alice",
        permlink: "gray-post",
        title: "Grayed Post",
        stats: { flag_weight: 0, gray: true, hide: false, total_votes: 2 }
      });

      renderItem(entry);

      fireEvent.click(screen.getByText("g.modmuted-message"));

      expect(screen.queryByText("g.modmuted-message")).not.toBeInTheDocument();
      expect(screen.getByText("Grayed Post")).toBeInTheDocument();
    });
  });
});

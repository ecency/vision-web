import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Entry } from "@/entities";
import { mockEntry } from "@/specs/test-utils";

// `@/utils` is globally mocked to only expose `random` + `getAccessToken`.
// DiscussionItem uses several real helpers (dateToFormatted, dateToFullRelative,
// isHiddenPost, createReplyPermlink, makeJsonMetaDataReply). Re-mock locally
// with importActual so those real implementations are preserved.
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

// The Reply toggle only renders for a logged-in user; keep the active user
// switchable per test (default: logged out, matching the global mock).
const activeUserRef = vi.hoisted(() => ({ current: null as string | null }));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({
    activeUser: activeUserRef.current ? { username: activeUserRef.current } : null
  })
}));

// The reply / edit / pin mutations broadcast to the chain — stub them so the
// component renders without an auth/network graph.
vi.mock("@/api/mutations", () => ({
  useCreateReply: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateReply: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePinReply: () => ({ mutateAsync: vi.fn() })
}));

// Cache manager used for optimistic mute updates.
vi.mock("@/core/caches", () => ({
  EcencyEntriesCacheManagement: {
    useUpdateEntry: () => ({ updateEntryQueryData: vi.fn() })
  }
}));

// Community-context builders (the global SDK mock doesn't expose these).
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
  getCommunityContextQueryOptions: vi.fn(() => ({
    queryKey: ["community-context"],
    queryFn: async () => ({ subscribed: false, role: "guest" }),
    enabled: false
  })),
  getCommunityPermissions: vi.fn(() => ({ canComment: true })),
  getCommunityType: vi.fn(() => 1)
}));

// Stub the action-bar buttons + author chrome from the shared barrel. Keep a
// deterministic EntryTipBtn stub so we can assert the gift button is present in
// the comment action bar (regression guard for the tip-on-comments feature).
vi.mock("@/features/shared", async () => {
  const Real = await import("react");
  return {
    EcencySourceBadge: () => null,
    EntryDeleteBtn: ({ children }: any) => Real.createElement("span", null, children),
    EntryPayout: () => Real.createElement("span", { "data-testid": "entry-payout" }),
    EntryTipBtn: () => Real.createElement("span", { "data-testid": "entry-tip-btn" }),
    EntryVoteBtn: () => Real.createElement("span", { "data-testid": "entry-vote-btn" }),
    EntryVotes: () => Real.createElement("span", { "data-testid": "entry-votes" }),
    ProfileLink: ({ children }: any) => Real.createElement("span", null, children),
    ProfilePopover: () => Real.createElement("span", { "data-testid": "profile-popover" }),
    UserAvatar: ({ username }: any) => Real.createElement("span", null, username)
  };
});

vi.mock("@/features/shared/mute-btn", () => ({ MuteBtn: () => null }));
vi.mock("@/features/shared/entry-link", async () => {
  const Real = await import("react");
  return { EntryLink: ({ children }: any) => Real.createElement("span", null, children) };
});
// Private discussion child trees — stub so the test focuses on the item's own bar.
vi.mock("@/features/shared/discussion/discussion-bots", () => ({ DiscussionBots: () => null }));
vi.mock("@/features/shared/discussion/discussion-item-body", () => ({
  DiscussionItemBody: () => null
}));
vi.mock("@/features/shared/discussion/discussion-list", () => ({ DiscussionList: () => null }));
vi.mock("@/features/shared/comment", () => ({ Comment: () => null }));

import { DiscussionItem } from "@/features/shared/discussion/discussion-item";
import enUS from "@/features/i18n/locales/en-US.json";

// Resolve a dotted i18n key against the shipped English locale.
function getLocaleValue(key: string) {
  return key
    .split(".")
    .reduce<any>((acc, part) => (acc == null ? acc : acc[part]), enUS as Record<string, unknown>);
}

function renderItem(entry: Entry, root: Entry) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DiscussionItem
        entry={entry}
        root={root}
        community={null}
        isRawContent={false}
        hideControls={false}
        discussionList={[]}
        botsList={[]}
        mutedUsers={[]}
        canMute={false}
      />
    </QueryClientProvider>
  );
}

describe("DiscussionItem", () => {
  afterEach(() => {
    activeUserRef.current = null;
  });

  const root = mockEntry({ author: "bob", permlink: "the-post", category: "hive-101" });
  const comment = mockEntry({
    author: "alice",
    permlink: "re-the-post",
    parent_author: "bob",
    parent_permlink: "the-post",
    depth: 1
  });

  it("renders the tip (gift) button in the comment action bar — the parity fix melinda asked for", () => {
    renderItem(comment, root);

    expect(screen.getByTestId("entry-tip-btn")).toBeInTheDocument();
    // It sits alongside the existing comment actions (not replacing them).
    expect(screen.getByTestId("entry-vote-btn")).toBeInTheDocument();
    expect(screen.getByTestId("entry-payout")).toBeInTheDocument();
  });

  it("does not render the action bar (and thus no tip button) when controls are hidden", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <DiscussionItem
          entry={comment}
          root={root}
          community={null}
          isRawContent={false}
          hideControls={true}
          discussionList={[]}
          botsList={[]}
          mutedUsers={[]}
          canMute={false}
        />
      </QueryClientProvider>
    );

    expect(screen.queryByTestId("entry-tip-btn")).not.toBeInTheDocument();
  });

  it("labels the collapse toggle with keys that exist in en-US.json", () => {
    // i18next is globally mocked to echo the key, so the rendered text IS the
    // key the component asked for. The hide side used to ask for
    // `chat.hide-message`, which no locale defines, and shipped the raw key.
    const lowRepComment = mockEntry({
      author: "spammer",
      permlink: "re-the-post-spam",
      parent_author: "bob",
      parent_permlink: "the-post",
      depth: 1,
      author_reputation: -8,
      net_rshares: 0,
      stats: { flag_weight: 0, gray: true, hide: false, total_votes: 0 }
    });

    renderItem(lowRepComment, root);

    const revealKey = screen.getByRole("button", { name: /^discussion\./ }).textContent!;
    expect(getLocaleValue(revealKey)).toBeTypeOf("string");

    fireEvent.click(screen.getByText(revealKey));

    const hideKey = screen.getByRole("button", { name: /^discussion\./ }).textContent!;
    expect(hideKey).not.toBe(revealKey);
    expect(getLocaleValue(hideKey)).toBeTypeOf("string");
  });

  it("animates the reply composer entrance only after clicking Reply, never on initial render", () => {
    activeUserRef.current = "demo";
    const { container } = renderItem(comment, root);

    // Nothing animates on mount — the composer (and its entrance wrapper)
    // doesn't exist until the user acts.
    expect(container.querySelector(".animate-fade-in-up")).toBeNull();

    fireEvent.click(screen.getByText("g.reply"));

    expect(container.querySelector(".animate-fade-in-up")).not.toBeNull();

    // Toggling the composer closed removes the wrapper again.
    fireEvent.click(screen.getByText("g.reply"));
    expect(container.querySelector(".animate-fade-in-up")).toBeNull();
  });
});

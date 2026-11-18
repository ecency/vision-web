import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockEntry } from "@/specs/test-utils";

/**
 * #1494: a cross-post card shows the ORIGINAL post (its title, summary, image,
 * author, tag and reply count), and every link on it leads to that original.
 * The muted-content child used to carry `isCrossPost ? entryProp : entry`
 * ternaries that were dead (its flag was read off the already-unwrapped entry);
 * computing the flag "correctly" there would have repointed the title, body and
 * thumbnail at the cross-post wrapper while the card's reply-count link kept
 * the original. This spec pins all of them to the same target.
 */

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

vi.mock("@ecency/render-helper", () => ({
  setProxyBase: vi.fn(),
  postBodySummary: vi.fn((entry: any) => `summary:${entry?.permlink ?? ""}`),
  getPostBodyText: vi.fn((entry: any) => `summary:${entry?.permlink ?? ""}`),
  catchPostImage: vi.fn(() => "https://i.ecency.com/p/HASH?format=match&mode=fit&width=600&height=500"),
  getEntryCardImage: vi.fn(() => "https://i.ecency.com/p/HASH?format=match&mode=fit&width=600&height=500"),
  getEntryCardImageRawUrl: vi.fn(() => "https://img.host/photo.png"),
  buildSrcSet: vi.fn(() => ""),
  proxifyImageSrc: vi.fn(() => ""),
  IMAGE_SIZES: "(max-width: 768px) 100vw, 700px"
}));

vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk"))
}));

vi.mock("next/image", () => ({
  default: ({ src, alt }: any) => <img src={src} alt={alt ?? ""} />
}));

// A real-logic EntryLink (href from makeEntryPath) so each link's target is the
// one the app would render; the rest of the barrel is inert.
vi.mock("@/features/shared", async () => {
  const { makeEntryPath } =
    await vi.importActual<typeof import("@/utils/make-path")>("@/utils/make-path");
  const Real = await import("react");
  const Stub = () => null;
  return {
    EntryLink: ({ entry, children, className }: any) =>
      Real.createElement(
        "a",
        {
          href: makeEntryPath(entry.category, entry.author, entry.permlink),
          className,
          "data-entry-link": ""
        },
        children
      ),
    ProfileLink: ({ username, children }: any) =>
      Real.createElement("a", { href: `/@${username}` }, children),
    EcencySourceBadge: Stub,
    UserAvatar: Stub,
    ProfilePopover: Stub,
    TimeLabel: Stub,
    EntryVoteBtn: Stub,
    EntryPayout: Stub,
    EntryVotes: Stub,
    EntryReblogBtn: Stub,
    EntryTipBtn: Stub,
    EntryMenu: Stub
  };
});

vi.mock("@/features/shared/tag", () => ({
  TagLink: ({ children }: any) => React.createElement("span", null, children)
}));
vi.mock("@/features/shared/entry-list-item/entry-list-item-client-init", () => ({
  EntryListItemClientInit: () => null
}));
vi.mock("@/features/shared/entry-list-item/entry-list-item-poll-icon", () => ({
  EntryListItemPollIcon: () => null
}));

import { EntryListItem } from "@/features/shared/entry-list-item";

function renderCard() {
  const original = mockEntry({
    author: "alice",
    permlink: "original-post",
    category: "photography",
    title: "Original Title",
    children: 2,
    json_metadata: { tags: ["photography"], image: ["https://img.host/photo.png"] }
  });
  const crossPost = mockEntry({
    author: "bob",
    permlink: "cross-post-wrapper",
    category: "hive-123456",
    title: "Cross post",
    children: 0,
    original_entry: original
  } as never);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <EntryListItem entry={crossPost} order={0} />
    </QueryClientProvider>
  );
}

describe("cross-post card links (#1494)", () => {
  it("points the title, summary, thumbnail and reply count at the original post", () => {
    const { container } = renderCard();

    const title = container.querySelector(".item-title")!.closest("a");
    const summary = container.querySelector(".item-summary .item-body")!.closest("a");
    const thumbnail = container.querySelector(".item-image a");
    const replies = container.querySelector(".entry-actions a[title]");

    expect(title).toHaveAttribute("href", "/@alice/original-post");
    expect(summary).toHaveAttribute("href", "/@alice/original-post");
    expect(thumbnail).toHaveAttribute("href", "/@alice/original-post");
    expect(replies).toHaveAttribute("href", "/@alice/original-post");
  });

  it("never links the cross-post wrapper itself", () => {
    const { container } = renderCard();
    const hrefs = Array.from(container.querySelectorAll("a[href]")).map((a) =>
      a.getAttribute("href")
    );
    expect(hrefs.filter((h) => h?.includes("cross-post-wrapper"))).toEqual([]);
    // The cross-post banner names the original as well.
    expect(container.querySelector(".cross-item-link")).toHaveAttribute(
      "href",
      "/@alice/original-post"
    );
  });
});

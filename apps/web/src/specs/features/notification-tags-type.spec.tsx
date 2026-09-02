import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { ApiTagsNotification } from "@/entities";
import { NotificationTagsType } from "@/features/shared/notifications/notification-types/notification-tags-type";

vi.mock("@/features/shared", () => ({
  EntryLink: ({ children, entry }: any) => (
    <a href={`/${entry.category}/@${entry.author}/${entry.permlink}`} data-testid="entry-link">
      {children}
    </a>
  )
}));

// The global @/utils mock only exports random/getAccessToken; the entry-category
// helper reaches for isCommunity.
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

const base = {
  id: "n1",
  read: 0 as const,
  timestamp: "2026-09-02T06:00:00Z",
  ts: 1,
  gk: "g",
  gkf: true,
  type: "tags" as const,
  tag: "photography"
};

describe("NotificationTagsType", () => {
  it("links a single post to its author, named by the source link", () => {
    const notification: ApiTagsNotification = {
      ...base,
      source: "alice",
      author: "alice",
      permlink: "sunset",
      title: "Sunset over the bay",
      img_url: null
    };

    render(
      <NotificationTagsType
        sourceLink={<span>@alice</span>}
        afterClick={vi.fn()}
        notification={notification}
        openLinksInNewTab={false}
      />
    );

    expect(screen.getByText("@alice")).toBeInTheDocument();
    expect(screen.getByText("notifications.tags-str")).toBeInTheDocument();
    // No metadata on the row, so the followed tag stands in as the category.
    expect(screen.getByTestId("entry-link")).toHaveAttribute("href", "/photography/@alice/sunset");
    expect(screen.getByText("Sunset over the bay")).toBeInTheDocument();
  });

  it("links a bundle to the tag's feed and names the tag, not @ecency", () => {
    const notification: ApiTagsNotification = {
      ...base,
      source: "ecency",
      count: 12,
      latest: [{ author: "alice", permlink: "sunset", title: "Sunset" }]
    };

    render(
      <NotificationTagsType
        sourceLink={<span>@ecency</span>}
        afterClick={vi.fn()}
        notification={notification}
        openLinksInNewTab={false}
      />
    );

    expect(screen.queryByText("@ecency")).not.toBeInTheDocument();
    expect(screen.getByText("#photography")).toBeInTheDocument();
    expect(screen.getByText("notifications.tags-bundle-str")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "notifications.tags-bundle-link" })).toHaveAttribute(
      "href",
      "/created/photography"
    );
    expect(screen.queryByTestId("entry-link")).not.toBeInTheDocument();
  });

  // The websocket and push routers refuse a malformed tag before it reaches a
  // URL; the row is the same data and must refuse it the same way.
  it.each(["../evil", "a/b", "a?x=1", "../@user", ""])("never links a bundle whose tag is %j", (tag) => {
    const notification: ApiTagsNotification = { ...base, tag, source: "ecency", count: 3 };

    render(
      <NotificationTagsType
        sourceLink={<span>@ecency</span>}
        afterClick={vi.fn()}
        notification={notification}
        openLinksInNewTab={false}
      />
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("falls back to the created feed as category when the tag is malformed", () => {
    const notification: ApiTagsNotification = {
      ...base,
      tag: "a/b",
      source: "alice",
      author: "alice",
      permlink: "sunset",
      title: null,
      img_url: null
    };

    render(
      <NotificationTagsType
        sourceLink={<span>@alice</span>}
        afterClick={vi.fn()}
        notification={notification}
        openLinksInNewTab={false}
      />
    );

    expect(screen.getByTestId("entry-link")).toHaveAttribute("href", "/created/@alice/sunset");
  });

  it("uses the deck's own click handler for a single post", () => {
    const onLinkClick = vi.fn();
    const notification: ApiTagsNotification = {
      ...base,
      source: "alice",
      author: "alice",
      permlink: "sunset",
      title: "Sunset",
      img_url: null
    };

    render(
      <NotificationTagsType
        sourceLink={<span>@alice</span>}
        onLinkClick={onLinkClick}
        afterClick={vi.fn()}
        notification={notification}
        openLinksInNewTab={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Sunset" }));
    expect(onLinkClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("entry-link")).not.toBeInTheDocument();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { ReactNode } from "react";
import { ApiTagsNotification } from "@/entities";
import { NotificationTagsType } from "@/features/shared/notifications/notification-types/notification-tags-type";

interface EntryLinkMockProps {
  children: ReactNode;
  entry: { category: string; author: string; permlink: string };
}

vi.mock("@/features/shared", () => ({
  EntryLink: ({ children, entry }: EntryLinkMockProps) => (
    <a href={`/${entry.category}/@${entry.author}/${entry.permlink}`}>{children}</a>
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
  type: "tags" as const
};

describe("NotificationTagsType", () => {
  it("links a single post to its author, named by the source link", () => {
    const notification: ApiTagsNotification = {
      ...base,
      source: "alice",
      tags: ["photography", "hive"],
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
    expect(screen.getByRole("link", { name: "Sunset over the bay" })).toHaveAttribute(
      "href",
      "/photography/@alice/sunset"
    );
  });

  it("links a bundle to the tag's feed and names the tag, not @ecency", () => {
    const notification: ApiTagsNotification = {
      ...base,
      tag: "photography",
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
    // The feed link is the only one; there is no post to link.
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  // The websocket and push routers refuse a malformed tag before it reaches a
  // URL; the row is the same data and must refuse it the same way.
  it.each(["../evil", "a/b", "a?x=1", "../@user", ""])("never links a bundle whose tag is %j", (tag) => {
    const notification: ApiTagsNotification = { ...base, tag, source: "ecency", count: 3, latest: [] };

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
      source: "alice",
      tags: ["a/b"],
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

    expect(screen.getByRole("link", { name: "sunset" })).toHaveAttribute("href", "/created/@alice/sunset");
  });

  // A post shows the first of the tags it matched, however many there are.
  it("shows the first matched tag of a post that matched several", () => {
    const notification: ApiTagsNotification = {
      ...base,
      source: "alice",
      tags: ["contest-2026", "hive"],
      author: "alice",
      permlink: "entry",
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

    expect(screen.getByRole("link", { name: "entry" })).toHaveAttribute("href", "/contest-2026/@alice/entry");
  });

  it("uses the deck's own click handler for a single post", () => {
    const onLinkClick = vi.fn();
    const notification: ApiTagsNotification = {
      ...base,
      source: "alice",
      tags: ["photography"],
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
    // The deck's handler replaces the entry link entirely.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

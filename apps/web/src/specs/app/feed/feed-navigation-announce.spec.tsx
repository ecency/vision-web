import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveAccount } from "@/core/hooks/use-active-account";

// The plumbing between the feed tab bar and the cached repaint (#1789).
//
// Everything else about the repaint can be green while this is broken, and the
// symptom would be silence: the feature simply never fires, and the reader gets
// exactly today's behaviour. So the two announcement paths are pinned here.
//
//  - The desktop tabs are <Link>s, and `useLinkStatus` can ONLY see a link from
//    inside it. A probe rendered as a sibling of the Link, or hoisted out of the
//    map, compiles, renders, and reports `pending: false` forever. This file
//    asserts DOM containment: a probe inside each tab's anchor, carrying that
//    tab's own feed.
//  - The mobile dropdown and the reblog toggle call `router.push`, which
//    `useLinkStatus` cannot see at all, so they announce through the store
//    themselves before pushing.

let mockSections: string[] = [];
let mockQuery = "";
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ sections: mockSections }),
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/" + mockSections.join("/"),
  useSearchParams: () => new URLSearchParams(mockQuery)
}));

// Stands in for the real probe, which renders null by design and so leaves
// nothing in the DOM to assert containment on.
vi.mock("@/app/(dynamicPages)/feed/_components/feed-link-pending-probe", () => ({
  FeedLinkPendingProbe: ({ target }: { target: { filter: string; tag: string } }) => (
    <span data-feed-probe={`${target.filter}|${target.tag}`} />
  )
}));

vi.mock("@/app/(dynamicPages)/feed/_components/feed-navigation-intent", async () => ({
  ...(await vi.importActual<Record<string, unknown>>(
    "@/app/(dynamicPages)/feed/_components/feed-navigation-intent"
  )),
  setFeedNavigationTarget: vi.fn(),
  clearFeedNavigationTarget: vi.fn()
}));

import { EntryIndexMenu } from "@/app/_components/entry-index-menu";
import {
  clearFeedNavigationTarget,
  setFeedNavigationTarget
} from "@/app/(dynamicPages)/feed/_components/feed-navigation-intent";

const announce = vi.mocked(setFeedNavigationTarget);
const clear = vi.mocked(clearFeedNavigationTarget);
const mockedUseActiveAccount = vi.mocked(useActiveAccount);

function setLoggedIn(loggedIn: boolean) {
  mockedUseActiveAccount.mockReturnValue({
    activeUser: loggedIn ? ({ username: "alice" } as never) : null,
    username: loggedIn ? "alice" : null,
    account: null,
    isLoading: false,
    isPending: false,
    isError: false,
    isSuccess: loggedIn,
    error: null,
    refetch: vi.fn()
  } as ReturnType<typeof useActiveAccount>);
}

/** The catch-all segments a public feed url resolves to, per next.config. */
function hrefToFeed(href: string): string {
  const [, first = "", second = ""] = href.split("?")[0].split("/");
  if (second === "feed" && first.startsWith("@")) {
    return `feed|${first}`;
  }
  return `${first}|${second}`;
}

const openMenu = () => document.querySelector<HTMLElement>(".ecency-dropdown-menu")!;

describe("feed navigation announcements", () => {
  beforeEach(() => {
    mockSections = [];
    mockQuery = "";
    mockPush.mockClear();
    announce.mockClear();
    clear.mockClear();
    setLoggedIn(false);
  });

  it("puts a probe inside every desktop tab, carrying that tab's feed", () => {
    setLoggedIn(true);
    mockSections = ["created", "photography"];

    const { container } = render(<EntryIndexMenu />);

    const tabs = Array.from(container.querySelectorAll<HTMLAnchorElement>("a.feed-tab"));
    // Tag chip, Following, Communities, Global, four sorts, Muted, Promoted.
    expect(tabs.length).toBe(10);

    for (const tab of tabs) {
      const probe = tab.querySelector("[data-feed-probe]");
      expect(probe, `${tab.id} renders no probe inside its link`).not.toBeNull();
      expect(probe!.getAttribute("data-feed-probe"), tab.id).toBe(
        hrefToFeed(tab.getAttribute("href")!)
      );
    }
  });

  it("announces the destination before a mobile dropdown item pushes", () => {
    setLoggedIn(true);
    mockSections = ["hot"];

    const { container } = render(<EntryIndexMenu />);

    // Mobile renders the same items behind a dropdown; jsdom applies no CSS, so
    // both bars are in the tree and the dropdown is reachable.
    const mobile = container.querySelector(".feed-navigation-mobile")!;
    const toggles = mobile.querySelectorAll<HTMLElement>(".ecency-dropdown-toggle");
    // The sort dropdown is the second one (the first is the source dropdown).
    fireEvent.click(toggles[toggles.length - 1]);

    // The open menu renders in a portal, outside the mobile bar.
    const item = within(openMenu()).getByText("entry-filter.filter-trending");
    fireEvent.click(item);

    expect(announce).toHaveBeenCalledWith({ filter: "trending", tag: "", noReblog: false });
    expect(mockPush).toHaveBeenCalledWith("/trending");
  });

  // Same feed, different client-side filter: the cache already holds exactly
  // what the destination will paint, so this is the one navigation the repaint
  // can always answer.
  it("announces the flipped no-reblog filter from the reblog toggle", () => {
    setLoggedIn(true);
    mockSections = ["feed", "@alice"];

    render(<EntryIndexMenu />);
    fireEvent.click(screen.getByRole("switch"));

    expect(announce).toHaveBeenCalledWith({ filter: "feed", tag: "@alice", noReblog: true });
    expect(mockPush).toHaveBeenCalledWith("/feed/@alice?no-reblog=true");
  });

  // The push path's only "the navigation landed" signal. Without it the rows
  // painted for the destination stay up over the destination itself.
  it("withdraws the announcement once the url becomes the destination", () => {
    setLoggedIn(true);
    mockSections = ["hot"];

    const { container, rerender } = render(<EntryIndexMenu />);
    const mobile = container.querySelector(".feed-navigation-mobile")!;
    const toggles = mobile.querySelectorAll<HTMLElement>(".ecency-dropdown-toggle");
    fireEvent.click(toggles[toggles.length - 1]);
    fireEvent.click(within(openMenu()).getByText("entry-filter.filter-trending"));

    // Still in flight: the url has not moved, so nothing is withdrawn yet.
    expect(clear).not.toHaveBeenCalled();

    mockSections = ["trending"];
    rerender(<EntryIndexMenu />);

    expect(clear).toHaveBeenCalledWith({ filter: "trending", tag: "", noReblog: false });
  });

  it("withdraws the announcement when only the query string moves", () => {
    setLoggedIn(true);
    mockSections = ["feed", "@alice"];

    const { rerender } = render(<EntryIndexMenu />);
    fireEvent.click(screen.getByRole("switch"));
    expect(clear).not.toHaveBeenCalled();

    // The reblog toggle changes no path segment, only `?no-reblog`.
    mockQuery = "no-reblog=true";
    rerender(<EntryIndexMenu />);

    expect(clear).toHaveBeenCalledWith({ filter: "feed", tag: "@alice", noReblog: true });
  });

  // The mobile dropdown leaves the CURRENT item clickable, and tapping it pushes
  // the same URL. Next does not re-run the route for that, so the effect that
  // clears the target never fires — announcing here would leave the repaint on
  // top of the real feed until the reader navigated somewhere else.
  it("announces nothing when the tapped item is the feed already open", () => {
    setLoggedIn(true);
    mockSections = ["trending"];

    const { container } = render(<EntryIndexMenu />);
    const mobile = container.querySelector(".feed-navigation-mobile")!;
    const toggles = mobile.querySelectorAll<HTMLElement>(".ecency-dropdown-toggle");
    fireEvent.click(toggles[toggles.length - 1]);

    // The item for the feed we are already on, inside the open (portaled) menu.
    // The toggle button carries the same label, so do not search the bar.
    fireEvent.click(within(openMenu()).getByText("entry-filter.filter-trending"));

    expect(announce).not.toHaveBeenCalled();
  });

  it("announces the reblog filter coming back off", () => {
    setLoggedIn(true);
    mockSections = ["feed", "@alice"];
    mockQuery = "no-reblog=true";

    render(<EntryIndexMenu />);
    fireEvent.click(screen.getByRole("switch"));

    expect(announce).toHaveBeenCalledWith({ filter: "feed", tag: "@alice", noReblog: false });
  });
});

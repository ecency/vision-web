import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient, mockCommunity } from "@/specs/test-utils";
import type { Community } from "@/entities";

const subscribe = vi.fn(async () => undefined);
const unsubscribe = vi.fn(async () => undefined);
let ranked: Community[] = [];
let town: Community | null = null;
let failTown = false;
let failRanked = false;
let subscriptions: string[][] = [];
let failSubscriptions = false;
let subscriptionsRetry: false | { retry: number; retryDelay: number } = false;
let activeUsername: string | null = "alice";
const rankedFetch = vi.fn();

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({
    activeUser: activeUsername ? { username: activeUsername } : null,
    username: activeUsername
  })
}));
vi.mock("@/features/shared", () => ({
  LoginRequired: ({ children }: React.PropsWithChildren) => <>{children}</>
}));
vi.mock("@/features/shared/user-avatar", () => ({
  UserAvatar: () => <span />
}));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils"))
}));
vi.mock("@/core/caches", () => ({
  getCommunityCache: () => ({
    queryKey: ["town"],
    queryFn: async () => {
      if (failTown) throw new Error("Town Square unavailable");
      return town;
    }
  })
}));
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<typeof import("@ecency/sdk")>("@ecency/sdk")),
  getCommunitiesQueryOptions: () => ({
    queryKey: ["ranked"],
    queryFn: async () => {
      rankedFetch();
      if (failRanked) throw new Error("Ranked communities unavailable");
      return ranked;
    }
  }),
  getAccountSubscriptionsQueryOptions: (username?: string) => ({
    queryKey: ["subscriptions", username],
    enabled: !!username,
    ...(subscriptionsRetry || { retry: false }),
    queryFn: async () => {
      if (failSubscriptions) throw new Error("Subscriptions unavailable");
      return subscriptions;
    }
  })
}));
vi.mock("@/api/sdk-mutations", () => ({
  useSubscribeCommunityMutation: () => ({ mutateAsync: subscribe, isPending: false }),
  useUnsubscribeCommunityMutation: () => ({ mutateAsync: unsubscribe, isPending: false })
}));

import { TopCommunitiesWidget } from "@/app/_components/top-communities-widget";

describe("feed community suggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    failTown = false;
    failRanked = false;
    failSubscriptions = false;
    subscriptionsRetry = false;
    activeUsername = "alice";
    subscriptions = [];
    town = mockCommunity({ name: "hive-125125", title: "Town Square" });
    ranked = [
      town,
      mockCommunity({ name: "hive-100001", title: "Photography" }),
      mockCommunity({ name: "hive-100002", title: "Gaming" }),
      mockCommunity({ name: "hive-100003", title: "Music" })
    ];
  });

  it("shows Town Square plus two distinct ranked communities and keeps discovery and creation reachable", async () => {
    renderWithQueryClient(<TopCommunitiesWidget />);
    await screen.findByRole("link", { name: "Town Square" });
    const others = ["Photography", "Gaming", "Music"];
    await waitFor(() =>
      expect(others.filter((t) => screen.queryByRole("link", { name: t })).length).toBe(2)
    );
    expect(screen.getAllByRole("link", { name: "Town Square" })).toHaveLength(1);
    const shown = others.filter((t) => screen.queryByRole("link", { name: t }));
    for (const title of shown) {
      const name = ranked.find((c) => c.title === title)!.name;
      expect(screen.getByRole("link", { name: title })).toHaveAttribute("href", `/created/${name}`);
    }
    expect(screen.getByRole("link", { name: "top-communities.explore" })).toHaveAttribute(
      "href",
      "/communities"
    );
    expect(screen.getByRole("link", { name: "top-communities.create-button" })).toHaveAttribute(
      "href",
      "/communities/create"
    );
  });

  it("rotates the two unpinned slots between page loads instead of always showing the leaders", async () => {
    // The pair is drawn from the top of the ranking with a per-mount seed, so
    // different loads surface different communities. Drive the seed directly.
    ranked = [
      town,
      ...Array.from({ length: 8 }, (_, i) =>
        mockCommunity({ name: `hive-20000${i}`, title: `Community ${i}` })
      )
    ];
    const pairs = new Set<string>();
    for (const seed of [0.05, 0.35, 0.65, 0.95]) {
      vi.spyOn(Math, "random").mockReturnValueOnce(seed);
      const { unmount } = renderWithQueryClient(<TopCommunitiesWidget />);
      await screen.findByRole("link", { name: "Town Square" });
      await waitFor(() =>
        expect(screen.getAllByRole("link", { name: /^Community \d$/ })).toHaveLength(2)
      );
      pairs.add(
        screen
          .getAllByRole("link", { name: /^Community \d$/ })
          .map((l) => l.textContent)
          .sort()
          .join("|")
      );
      unmount();
    }
    expect(pairs.size).toBeGreaterThan(1);
    // Town Square is pinned and never drawn twice.
    expect([...pairs].every((p) => !p.includes("Town Square"))).toBe(true);
  });

  it("renders the ranked list even when the Town Square request fails", async () => {
    failTown = true;
    ranked = ranked.slice(1);
    renderWithQueryClient(<TopCommunitiesWidget />);
    await screen.findByRole("link", { name: "Music" });
    expect(screen.getByRole("link", { name: "Photography" })).toBeInTheDocument();
  });

  it("handles duplicates without hanging or repeating a community", async () => {
    ranked = [town!, town!, ranked[1], ranked[1]];
    renderWithQueryClient(<TopCommunitiesWidget />);
    await screen.findByRole("link", { name: "Photography" });
    expect(screen.getAllByRole("link", { name: "Town Square" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Photography" })).toHaveLength(1);
  });

  it("keeps cached Town Square available if ranking fails", async () => {
    failRanked = true;
    renderWithQueryClient(<TopCommunitiesWidget />);
    expect(await screen.findByRole("link", { name: "Town Square" })).toBeInTheDocument();
  });

  it("retains join, joined status, and unsubscribe with the compact presentation", async () => {
    ranked = [];
    renderWithQueryClient(<TopCommunitiesWidget />);
    fireEvent.click(await screen.findByRole("button", { name: "community.subscribe" }));
    await waitFor(() => expect(subscribe).toHaveBeenCalledWith({ community: "hive-125125" }));
    const joined = await screen.findByRole("button", { name: "community.subscribed" });
    await waitFor(() => expect(joined).toBeEnabled());
    fireEvent.click(joined);
    await waitFor(() => expect(unsubscribe).toHaveBeenCalledWith({ community: "hive-125125" }));
    expect(await screen.findByRole("button", { name: "community.subscribe" })).toBeInTheDocument();
  });

  it("keeps discovery links available when both requests fail", async () => {
    failRanked = failTown = true;
    renderWithQueryClient(<TopCommunitiesWidget />);
    expect(await screen.findByText("g.server-error")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "top-communities.explore" })).toHaveAttribute(
      "href",
      "/communities"
    );
  });

  describe("my communities", () => {
    const subscribed = (n: number) =>
      Array.from({ length: n }, (_, i) => [`hive-30000${i}`, `Joined ${i}`, "guest", ""]);
    const joinedLinks = () => screen.queryAllByRole("link", { name: /^Joined \d$/ });

    it("lists 5 distinct subscribed communities and links to the reader's full list", async () => {
      subscriptions = subscribed(7);
      renderWithQueryClient(<TopCommunitiesWidget />);
      expect(await screen.findByText("top-communities.my-title")).toBeInTheDocument();
      await waitFor(() => expect(joinedLinks()).toHaveLength(5));
      const names = joinedLinks().map((l) => l.textContent);
      expect(new Set(names).size).toBe(5);
      for (const link of joinedLinks()) {
        const row = subscriptions.find((r) => r[1] === link.textContent)!;
        expect(link).toHaveAttribute("href", `/created/${row[0]}`);
      }
      expect(screen.getByRole("link", { name: "top-communities.view-all" })).toHaveAttribute(
        "href",
        "/@alice/communities"
      );
      expect(screen.getByRole("link", { name: "top-communities.explore" })).toHaveAttribute(
        "href",
        "/communities"
      );
    });

    it("lists every subscription when there are fewer than 5", async () => {
      subscriptions = subscribed(3);
      renderWithQueryClient(<TopCommunitiesWidget />);
      await waitFor(() => expect(joinedLinks()).toHaveLength(3));
    });

    it("skips malformed rows and falls back to the name for an empty title", async () => {
      subscriptions = [
        ["hive-300001", "Joined 1", "guest", ""],
        ["hive-300001", "Joined 1", "guest", ""],
        "hive-300002" as unknown as string[],
        ["", "Joined 3", "guest", ""],
        ["hive-300004", "", "guest", ""]
      ];
      renderWithQueryClient(<TopCommunitiesWidget />);
      expect(await screen.findByRole("link", { name: "Joined 1" })).toHaveAttribute(
        "href",
        "/created/hive-300001"
      );
      expect(screen.getByRole("link", { name: "hive-300004" })).toHaveAttribute(
        "href",
        "/created/hive-300004"
      );
      expect(screen.getAllByRole("listitem")).toHaveLength(2);
    });

    it("picks a different set between page loads", async () => {
      subscriptions = subscribed(9);
      const sets = new Set<string>();
      for (const seed of [0.05, 0.35, 0.65, 0.95]) {
        vi.spyOn(Math, "random").mockReturnValueOnce(seed);
        const { unmount } = renderWithQueryClient(<TopCommunitiesWidget />);
        await waitFor(() => expect(joinedLinks()).toHaveLength(5));
        sets.add(
          joinedLinks()
            .map((l) => l.textContent)
            .sort()
            .join("|")
        );
        unmount();
      }
      expect(sets.size).toBeGreaterThan(1);
    });

    it("does not request or show the discover list when the reader has subscriptions", async () => {
      subscriptions = subscribed(2);
      renderWithQueryClient(<TopCommunitiesWidget />);
      await waitFor(() => expect(joinedLinks()).toHaveLength(2));
      expect(screen.queryByText("top-communities.discover-title")).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Town Square" })).not.toBeInTheDocument();
      expect(rankedFetch).not.toHaveBeenCalled();
    });

    it("does not start discover for a reader whose account is restored on mount", async () => {
      // A real page load restores the active user in ClientInit's mount effect,
      // which sits before the page in the tree. Model that order: the server
      // render and the first client render have no user.
      subscriptions = subscribed(2);
      activeUsername = null;
      function Page() {
        const [, rerender] = React.useState(0);
        return (
          <>
            <Restore onMount={() => {
              activeUsername = "alice";
              rerender(1);
            }} />
            <TopCommunitiesWidget />
          </>
        );
      }
      function Restore({ onMount }: { onMount: () => void }) {
        React.useEffect(onMount, []);
        return null;
      }
      renderWithQueryClient(<Page />);
      await waitFor(() => expect(joinedLinks()).toHaveLength(2));
      expect(rankedFetch).not.toHaveBeenCalled();
    });

    it("shows discover in a logged-out tab after another tab logs in", async () => {
      // The other tab writes the stored account; this tab's store stays empty.
      activeUsername = null;
      localStorage.setItem("ecency_active_user", "alice");
      localStorage.setItem("ecency_user_alice", "e30=");
      try {
        renderWithQueryClient(<TopCommunitiesWidget />);
        expect(await screen.findByRole("link", { name: "Town Square" })).toBeInTheDocument();
      } finally {
        localStorage.clear();
      }
    });

    it("renders the skeleton, not discover, on the server", async () => {
      const { renderToString } = await import("react-dom/server");
      const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
      activeUsername = null;
      const html = renderToString(
        <QueryClientProvider client={new QueryClient()}>
          <TopCommunitiesWidget />
        </QueryClientProvider>
      );
      expect(html).not.toContain("top-communities.discover-title");
      expect(html).toContain('href="/communities"');
    });

    it("falls back to discover when the reader has no subscriptions", async () => {
      renderWithQueryClient(<TopCommunitiesWidget />);
      expect(await screen.findByRole("link", { name: "Town Square" })).toBeInTheDocument();
      expect(screen.getByText("top-communities.discover-title")).toBeInTheDocument();
      expect(screen.queryByText("top-communities.my-title")).not.toBeInTheDocument();
    });

    it("falls back to discover when the subscriptions request fails", async () => {
      failSubscriptions = true;
      subscriptions = subscribed(3);
      renderWithQueryClient(<TopCommunitiesWidget />);
      expect(await screen.findByRole("link", { name: "Town Square" })).toBeInTheDocument();
      // The join buttons refetch the failed query; the card must not fall back
      // to the skeleton or flip to "My communities" when that refetch lands.
      failSubscriptions = false;
      await new Promise((r) => setTimeout(r, 100));
      expect(screen.getByRole("link", { name: "Town Square" })).toBeInTheDocument();
      expect(screen.queryByText("top-communities.my-title")).not.toBeInTheDocument();
    });

    it("keeps discover on screen after the reader joins a suggested community", async () => {
      ranked = [];
      renderWithQueryClient(<TopCommunitiesWidget />);
      fireEvent.click(await screen.findByRole("button", { name: "community.subscribe" }));
      await waitFor(() => expect(subscribe).toHaveBeenCalled());
      expect(await screen.findByRole("button", { name: "community.subscribed" })).toBeInTheDocument();
      expect(screen.getByText("top-communities.discover-title")).toBeInTheDocument();
      expect(screen.queryByText("top-communities.my-title")).not.toBeInTheDocument();
    });

    it("falls back to discover after the first failed attempt, not after every retry", async () => {
      failSubscriptions = true;
      subscriptionsRetry = { retry: 3, retryDelay: 60_000 };
      renderWithQueryClient(<TopCommunitiesWidget />);
      expect(await screen.findByRole("link", { name: "Town Square" })).toBeInTheDocument();
    });

    it("shows discover to a logged-out reader", async () => {
      activeUsername = null;
      subscriptions = subscribed(3);
      renderWithQueryClient(<TopCommunitiesWidget />);
      expect(await screen.findByRole("link", { name: "Town Square" })).toBeInTheDocument();
      expect(joinedLinks()).toHaveLength(0);
      expect(screen.queryByRole("link", { name: "top-communities.view-all" })).not.toBeInTheDocument();
    });
  });
});

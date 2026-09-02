import { screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { TrendingTagsCard } from "@/app/_components/trending-tags-card";

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ sections: ["hot", ""] })
}));

// The global @/utils mock keeps only two members; TagLink needs isCommunity.
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  getAccessToken: vi.fn(() => "mock-token")
}));

vi.mock("@/core/caches", () => ({
  getCommunityCache: (tag: string) => ({
    queryKey: ["community", tag],
    queryFn: async () => null,
    enabled: false
  })
}));

let followedTags: string[] = [];
const TRENDING = ["hive", "photography", "life", "art"];

vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<typeof import("@ecency/sdk")>("@ecency/sdk");
  return {
    ...actual,
    getTrendingTagsQueryOptions: vi.fn(() => ({
      queryKey: ["trending-tags", 250],
      queryFn: async () => TRENDING,
      initialPageParam: 0,
      getNextPageParam: () => undefined
    })),
    getFavoriteTagsQueryOptions: vi.fn((username?: string) => ({
      queryKey: ["accounts", "favorite-tags", username],
      queryFn: async () =>
        followedTags.map((tag) => ({ _id: `id-${tag}`, tag, created: "", timestamp: 1 })),
      enabled: !!username
    })),
    useFavoriteTagAdd: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useFavoriteTagDelete: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false }))
  };
});

// The chips only: the card's "View more" link sits outside the flex-wrap row.
const chipTexts = () =>
  Array.from(document.querySelectorAll(".trending-tags-card .flex-wrap a")).map((a) =>
    (a.textContent ?? "").trim()
  );

describe("TrendingTagsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    followedTags = [];
  });

  it("pins the user's followed tags first and lists each tag once", async () => {
    vi.mocked(useActiveAccount).mockReturnValue({ activeUser: { username: "alice" } } as never);
    followedTags = ["art", "contest-2026"];

    renderWithQueryClient(<TrendingTagsCard />);

    await screen.findByText("contest-2026");
    expect(chipTexts()).toEqual(["art", "contest-2026", "hive", "photography", "life"]);
    // Every chip carries the follow toggle; the pinned ones read as followed.
    expect(screen.getAllByRole("button", { name: "follow-tag.delete" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "follow-tag.add" })).toHaveLength(3);
  });

  it("shows the plain trending list without toggles to a signed-out reader", async () => {
    vi.mocked(useActiveAccount).mockReturnValue({ activeUser: null } as never);

    renderWithQueryClient(<TrendingTagsCard />);

    await screen.findByText("art");
    expect(chipTexts()).toEqual(TRENDING);
    expect(screen.queryByRole("button", { name: "follow-tag.add" })).not.toBeInTheDocument();
  });
});

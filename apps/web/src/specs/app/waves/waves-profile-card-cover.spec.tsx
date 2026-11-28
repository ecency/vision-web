import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { WavesProfileCard } from "@/app/waves/_components/waves-profile-card";
import { createTestQueryClient, mockActiveUser, renderWithQueryClient } from "@/specs/test-utils";

vi.mock("@/features/shared", () => ({ UserAvatar: () => null }));
vi.mock("@/app/(dynamicPages)/profile/[username]/_components/friends", () => ({
  Followers: () => null,
  Following: () => null
}));

describe("WavesProfileCard cover (#2214)", () => {
  beforeEach(() => {
    vi.mocked(useActiveAccount).mockReturnValue({
      activeUser: mockActiveUser({ username: "alice" }),
      username: "alice",
      account: null,
      isLoading: false,
      isPending: false,
      isError: false,
      isSuccess: true,
      error: null,
      refetch: vi.fn()
    } as unknown as ReturnType<typeof useActiveAccount>);
  });

  it("crops the cover to its box instead of stretching it", () => {
    const queryClient = createTestQueryClient();
    // the global @ecency/sdk mock gives getAccountFullQueryOptions this key
    queryClient.setQueryData(["account"], {
      name: "alice",
      profile: { cover_image: "https://images.example/cover.jpg" },
      follow_stats: { follower_count: 1, following_count: 2 }
    });
    const { container } = renderWithQueryClient(<WavesProfileCard />, { queryClient });

    const cover = container.querySelector("img.h-\\[156px\\]");
    expect(cover).not.toBeNull();
    expect(cover).toHaveClass("object-cover");
  });
});

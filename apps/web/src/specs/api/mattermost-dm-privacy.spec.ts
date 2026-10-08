import { describe, it, expect, vi, beforeEach } from "vitest";

const mockProps = vi.fn();
const mockFetchQuery = vi.fn();

vi.mock("@/server/mattermost", () => ({
  getMattermostUserWithProps: (...args: unknown[]) => mockProps(...args),
  getUserDmPrivacy: (user: { props?: Record<string, string> }) =>
    user.props?.ecency_dm_privacy ?? "all"
}));

vi.mock("@/core/react-query", () => ({
  getQueryClient: () => ({ fetchQuery: (...args: unknown[]) => mockFetchQuery(...args) })
}));

vi.mock("@ecency/sdk", () => ({
  getRelationshipBetweenAccountsQueryOptions: (follower: string, following: string) => ({
    follower,
    following
  })
}));

import { getDmPrivacyRejection } from "@/server/chat-dm-privacy";

const VICTIM = { id: "v", username: "victor" };

describe("getDmPrivacyRejection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProps.mockResolvedValue({ props: { ecency_dm_privacy: "followers" } });
    // victor follows alice only.
    mockFetchQuery.mockImplementation(({ following }: { following: string }) =>
      Promise.resolve({ follows: following === "alice" })
    );
  });

  it("allows a followers-only member when they follow every sender", async () => {
    expect(await getDmPrivacyRejection(VICTIM, ["alice"])).toBeNull();
  });

  it("rejects a followers-only member when any other participant is not followed", async () => {
    const rejection = await getDmPrivacyRejection(VICTIM, ["alice", "stranger"]);

    expect(rejection).toMatchObject({ privacy_level: "followers", target_username: "victor" });
    expect(rejection?.error).toContain("@stranger");
  });

  it("rejects a member who accepts no DMs without looking anything up", async () => {
    mockProps.mockResolvedValue({ props: { ecency_dm_privacy: "none" } });

    expect(await getDmPrivacyRejection(VICTIM, ["alice"])).toMatchObject({ privacy_level: "none" });
    expect(mockFetchQuery).not.toHaveBeenCalled();
  });
});

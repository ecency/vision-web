import "@testing-library/jest-dom";
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublishSuccessState } from "@/app/publish/_components/publish-success-state";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { mockActiveUser, mockFullAccount, renderWithQueryClient } from "@/specs/test-utils";

vi.mock("@/config", () => ({
  EcencyConfigManager: {
    getConfigValue: (fn: (c: unknown) => unknown) => fn({ visionFeatures: { newsletter: { enabled: true } } })
  }
}));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<object>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token"),
  ensureValidToken: vi.fn(async () => "mock-token")
}));

const fetchMock = vi.fn();
const entry = { title: "First!", author: "newbie", permlink: "first", category: "hive-1" };

/**
 * The success screen offers the digest only when the publish flow told it this
 * was the first publish. That decision is made at publish time from the account
 * as loaded; the screen must not infer it, since the cached post count is not
 * refreshed by the publish and a second post looks the same afterwards.
 */
describe("PublishSuccessState and the first-publish digest offer", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string) =>
      url === "/api/newsletter/subscriptions"
        ? Promise.resolve({ ok: true, status: 200, json: async () => ({ subscriptions: [] }) } as Response)
        : Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as Response)
    );
    window.localStorage.clear();
    vi.mocked(useActiveAccount).mockReturnValue({
      activeUser: mockActiveUser({ username: "newbie" }),
      username: "newbie",
      account: mockFullAccount({ name: "newbie", post_count: 0 }),
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isSuccess: true
    } as never);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("offers the digest when told this was the first publish", async () => {
    renderWithQueryClient(<PublishSuccessState step="published" setEditStep={() => {}} entryInfo={entry} firstPublish={true} />);
    expect(await screen.findByText("newsletter.prompt-title")).toBeInTheDocument();
  });

  it("offers nothing on a later publish, even with the same cached account, and nothing when scheduled", async () => {
    const { unmount } = renderWithQueryClient(<PublishSuccessState step="published" setEditStep={() => {}} entryInfo={entry} firstPublish={false} />);
    await new Promise((r) => setTimeout(r, 40));
    expect(screen.queryByText("newsletter.prompt-title")).not.toBeInTheDocument();
    unmount();
    renderWithQueryClient(<PublishSuccessState step="scheduled" setEditStep={() => {}} entryInfo={entry} firstPublish={true} />);
    await new Promise((r) => setTimeout(r, 40));
    expect(screen.queryByText("newsletter.prompt-title")).not.toBeInTheDocument();
  });
});

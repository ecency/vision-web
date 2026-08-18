import "@testing-library/jest-dom";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { EmailDigestsSettings } from "@/app/(dynamicPages)/profile/[username]/settings/_email-digests";
import { digestSubscriptionsKey } from "@/features/newsletter";
import {
  cleanupModalContainers,
  createTestQueryClient,
  mockActiveUser,
  renderWithQueryClient,
  setupModalContainers
} from "@/specs/test-utils";

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
const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);

const A1 = { id: "a1", email: "alice@example.com", account: "alice", type: "community", target: "hive-1", cadence: "weekly", status: "active", created_at: "" };
const A2 = { id: "a2", email: "alice@example.com", account: "alice", type: "creator", target: "good-karma", cadence: "weekly", status: "active", created_at: "" };
const B1 = { id: "b1", email: "alice-work@example.com", account: "alice", type: "community", target: "hive-2", cadence: "monthly", status: "active", created_at: "" };
const S1 = { id: "s1", email: "alice@example.com", account: "alice", type: "site", target: "ecency", cadence: "weekly", status: "active", created_at: "" };

describe("EmailDigestsSettings", () => {
  beforeEach(() => {
    setupModalContainers();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    vi.mocked(useActiveAccount).mockReturnValue({
      activeUser: mockActiveUser({ username: "alice" }),
      username: "alice",
      account: null,
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isSuccess: true
    } as never);
  });
  afterEach(() => {
    cleanupModalContainers();
    vi.unstubAllGlobals();
  });

  it("labels a site-digest subscription as the Ecency digest, not the notification digest", () => {
    const client = createTestQueryClient();
    client.setQueryData(digestSubscriptionsKey("alice"), [S1]);
    renderWithQueryClient(<EmailDigestsSettings />, { queryClient: client });
    expect(screen.getByText("newsletter.row-site")).toBeInTheDocument();
    expect(screen.queryByText("newsletter.row-own")).not.toBeInTheDocument();
  });

  it("stopping all mail to ONE address keeps the account's subscriptions on other addresses visible", async () => {
    const client = createTestQueryClient();
    client.setQueryData(digestSubscriptionsKey("alice"), [A1, A2, B1]);
    fetchMock.mockImplementation((url: string) =>
      url === "/api/newsletter/unsubscribe-all" ? ok({ suppressed: true }) : ok({ subscriptions: [A1, A2, B1] })
    );
    renderWithQueryClient(<EmailDigestsSettings />, { queryClient: client });

    // One "stop all" per address; press the one for the first address and confirm.
    const stopButtons = screen.getAllByRole("button", { name: "newsletter.stop-all" });
    expect(stopButtons).toHaveLength(2);
    fireEvent.click(stopButtons[0]);
    fireEvent.click(await screen.findByRole("button", { name: "newsletter.stop-all-ok" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[0] === "/api/newsletter/unsubscribe-all");
      expect(JSON.parse(call![1].body)).toMatchObject({ email: "alice@example.com", code: "mock-token" });
    });
    // The other address's subscription is still there; only alice@ rows went.
    await waitFor(() => expect(client.getQueryData(digestSubscriptionsKey("alice"))).toEqual([B1]));
    expect(screen.getByText("newsletter.row-community")).toBeInTheDocument();
  });
});

import "@testing-library/jest-dom";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewsletterRuntimeProvider } from "@/features/newsletter/runtime";
import type { ReactElement } from "react";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { getDigestSubscriptionsRequest, subscribeDigestRequest, unsubscribeAllDigestsRequest } from "@ecency/sdk";
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

// Transport is the SDK's (pinned in its api.spec.ts); this file pins the
// settings surface: what is asked of the SDK client and what the cache keeps.
const subscribeMock = vi.mocked(subscribeDigestRequest);
const unsubscribeAllMock = vi.mocked(unsubscribeAllDigestsRequest);

const A1 = { id: "a1", email: "alice@example.com", account: "alice", type: "community", target: "hive-1", cadence: "weekly", status: "active", created_at: "" };
const A2 = { id: "a2", email: "alice@example.com", account: "alice", type: "creator", target: "good-karma", cadence: "weekly", status: "active", created_at: "" };
const B1 = { id: "b1", email: "alice-work@example.com", account: "alice", type: "community", target: "hive-2", cadence: "monthly", status: "active", created_at: "" };
const S1 = { id: "s1", email: "alice@example.com", account: "alice", type: "site", target: "ecency", cadence: "weekly", status: "active", created_at: "" };


/** Renders inside a "service configured" runtime, as app/providers.tsx does on a configured deploy. */
function renderConfigured(ui: ReactElement, options?: Parameters<typeof renderWithQueryClient>[1]) {
  return renderWithQueryClient(<NewsletterRuntimeProvider configured>{ui}</NewsletterRuntimeProvider>, options);
}

describe("EmailDigestsSettings", () => {
  beforeEach(() => {
    setupModalContainers();
    subscribeMock.mockReset();
    unsubscribeAllMock.mockReset();
    // The list refetch after a mutation must resolve, or the query errors.
    vi.mocked(getDigestSubscriptionsRequest).mockReset();
    vi.mocked(getDigestSubscriptionsRequest).mockResolvedValue([]);
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
  });

  it("changes the cadence of the OWN digest through the service like any other", async () => {
    const OWN = { id: "o1", email: "alice@example.com", account: "alice", type: "own", target: "alice", cadence: "weekly", status: "active", created_at: "" };
    const client = createTestQueryClient();
    client.setQueryData(digestSubscriptionsKey("alice"), [OWN]);
    subscribeMock.mockResolvedValue({ status: "active", created: false, subscription: { ...OWN, cadence: "monthly" } } as never);
    renderConfigured(<EmailDigestsSettings />, { queryClient: client });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "monthly" } });
    await waitFor(() => {
      expect(subscribeMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: "own", target: "alice", cadence: "monthly", source: "settings" }),
        "mock-token"
      );
    });
  });

  it("labels a site-digest subscription as the Ecency digest, not the notification digest", () => {
    const client = createTestQueryClient();
    client.setQueryData(digestSubscriptionsKey("alice"), [S1]);
    renderConfigured(<EmailDigestsSettings />, { queryClient: client });
    expect(screen.getByText("newsletter.row-site")).toBeInTheDocument();
    expect(screen.queryByText("newsletter.row-own")).not.toBeInTheDocument();
  });

  it("stopping all mail to ONE address keeps the account's subscriptions on other addresses visible", async () => {
    const client = createTestQueryClient();
    client.setQueryData(digestSubscriptionsKey("alice"), [A1, A2, B1]);
    unsubscribeAllMock.mockResolvedValue(undefined as never);
    renderConfigured(<EmailDigestsSettings />, { queryClient: client });

    // One "stop all" per address; press the one for the first address and confirm.
    const stopButtons = screen.getAllByRole("button", { name: "newsletter.stop-all" });
    expect(stopButtons).toHaveLength(2);
    fireEvent.click(stopButtons[0]);
    fireEvent.click(await screen.findByRole("button", { name: "newsletter.stop-all-ok" }));

    await waitFor(() => {
      expect(unsubscribeAllMock).toHaveBeenCalledWith("alice@example.com", "mock-token");
    });
    // The other address's subscription is still there; only alice@ rows went.
    await waitFor(() => expect(client.getQueryData(digestSubscriptionsKey("alice"))).toEqual([B1]));
    expect(screen.getByText("newsletter.row-community")).toBeInTheDocument();
  });
});

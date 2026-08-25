import "@testing-library/jest-dom";
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { NewsletterRuntimeProvider } from "@/features/newsletter/runtime";
import { SenderStatusNotice, senderStandingKey } from "@/features/newsletter";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { getNewsletterSenderRequest } from "@ecency/sdk";
import { createTestQueryClient, mockActiveUser, renderWithQueryClient } from "@/specs/test-utils";

const flags = vi.hoisted(() => ({ newsletter: true }));
vi.mock("@/config", () => ({
  EcencyConfigManager: {
    getConfigValue: (fn: (c: unknown) => unknown) => fn({ visionFeatures: { newsletter: { enabled: flags.newsletter } } })
  }
}));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<object>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token"),
  ensureValidToken: vi.fn(async () => "mock-token")
}));

// The SDK owns the transport (pinned in its own api.spec.ts); this file pins
// what web owns: when the standing is asked for, for whom, and what renders.
const standingMock = vi.mocked(getNewsletterSenderRequest);
const standing = (over: Record<string, unknown>) => ({
  type: "creator",
  target: "alice",
  status: "active",
  reason: null,
  since: null,
  stats: { delivered: 500, bounced: 3, rejected: 1, complaints: 0, unsubscribed: 2, complaintRate: 0, bounceRate: 0.006 },
  ...over
});

function loggedIn(username: string | null) {
  vi.mocked(useActiveAccount).mockReturnValue({
    activeUser: username ? mockActiveUser({ username }) : null,
    username,
    account: null,
    isLoading: false,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isSuccess: true
  } as never);
}

const render = (ui: ReactElement, queryClient?: ReturnType<typeof createTestQueryClient>) =>
  renderWithQueryClient(<NewsletterRuntimeProvider configured>{ui}</NewsletterRuntimeProvider>, queryClient ? { queryClient } : undefined);

/** vision-web#1513: the suspension is visible to the sender, and only when there is one to see. */
describe("SenderStatusNotice", () => {
  beforeEach(() => {
    standingMock.mockReset();
    flags.newsletter = true;
    loggedIn("alice");
  });

  it("shows the suspension, its reason and since when, to the sender", async () => {
    standingMock.mockResolvedValue(standing({ status: "suspended", reason: "complaint_rate", since: "2026-08-18T13:00:00Z" }) as never);
    render(<SenderStatusNotice type="creator" target="alice" isSender />);
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("newsletter.suspended-title-creator");
    expect(notice).toHaveTextContent("newsletter.suspended-reason-complaints");
    expect(notice).toHaveTextContent("newsletter.suspended-help");
    expect(standingMock).toHaveBeenCalledWith("creator", "alice", "mock-token");
  });

  it("renders nothing while the sender is in good standing, and says why for a bounce suspension of a community", async () => {
    standingMock.mockResolvedValue(standing({ status: "active" }) as never);
    const { container, unmount } = render(<SenderStatusNotice type="creator" target="alice" isSender />);
    await waitFor(() => expect(standingMock).toHaveBeenCalledTimes(1));
    expect(container.querySelector("[role=status]")).toBeNull();
    unmount();
    standingMock.mockResolvedValue(standing({ type: "community", target: "hive-125125", status: "suspended", reason: "bounce_rate", since: "2026-08-18T13:00:00Z" }) as never);
    render(<SenderStatusNotice type="community" target="hive-125125" isSender />);
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("newsletter.suspended-title-community");
    expect(notice).toHaveTextContent("newsletter.suspended-reason-bounces");
  });

  it("a manual suspension says so, and an unknown reason falls back to the manual wording", async () => {
    standingMock.mockResolvedValue(standing({ status: "suspended", reason: "manual", since: "2026-08-18T13:00:00Z" }) as never);
    const { unmount } = render(<SenderStatusNotice type="creator" target="alice" isSender />);
    expect(await screen.findByRole("status")).toHaveTextContent("newsletter.suspended-reason-manual");
    unmount();
    standingMock.mockResolvedValue(standing({ status: "suspended", reason: "something_new", since: null }) as never);
    render(<SenderStatusNotice type="creator" target="alice" isSender />);
    expect(await screen.findByRole("status")).toHaveTextContent("newsletter.suspended-reason-manual");
  });

  it("a standing cached by one viewer is never shown to another: the key is scoped to the viewer and a non-sender renders nothing regardless", async () => {
    // A team member (alice) fetched and saw the suspension...
    standingMock.mockResolvedValue(standing({ type: "community", target: "hive-125125", status: "suspended", reason: "complaint_rate", since: "2026-08-18T13:00:00Z" }) as never);
    const client = createTestQueryClient();
    const { unmount } = render(<SenderStatusNotice type="community" target="hive-125125" isSender />, client);
    await screen.findByRole("status");
    expect(client.getQueryData(senderStandingKey("community", "hive-125125", "alice"))).toMatchObject({ status: "suspended" });
    unmount();
    // ...then a plain member (carol) opens the same page in the same browser, same cache.
    loggedIn("carol");
    standingMock.mockReset();
    const { container } = render(<SenderStatusNotice type="community" target="hive-125125" isSender={false} />, client);
    await new Promise((r) => setTimeout(r, 30));
    expect(container.querySelector("[role=status]")).toBeNull();
    expect(standingMock).not.toHaveBeenCalled();
    // Even a stale entry under carol's own key (say, from a role she since lost) is not shown once she is no longer a sender.
    client.setQueryData(senderStandingKey("community", "hive-125125", "carol"), standing({ status: "suspended", reason: "manual" }));
    const { container: c2 } = render(<SenderStatusNotice type="community" target="hive-125125" isSender={false} />, client);
    await new Promise((r) => setTimeout(r, 30));
    expect(c2.querySelector("[role=status]")).toBeNull();
  });

  it("never asks when the viewer is not the sender, is logged out, or the feature is off", async () => {
    standingMock.mockResolvedValue(standing({ status: "suspended", reason: "manual" }) as never);
    const { container: c1, unmount: u1 } = render(<SenderStatusNotice type="creator" target="alice" isSender={false} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(standingMock).not.toHaveBeenCalled();
    expect(c1.textContent).toBe("");
    u1();
    loggedIn(null);
    const { unmount: u2 } = render(<SenderStatusNotice type="creator" target="alice" isSender />);
    await new Promise((r) => setTimeout(r, 30));
    expect(standingMock).not.toHaveBeenCalled();
    u2();
    loggedIn("alice");
    flags.newsletter = false;
    render(<SenderStatusNotice type="creator" target="alice" isSender />);
    await new Promise((r) => setTimeout(r, 30));
    expect(standingMock).not.toHaveBeenCalled();
  });
});

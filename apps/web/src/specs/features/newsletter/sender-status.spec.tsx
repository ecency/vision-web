import "@testing-library/jest-dom";
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { NewsletterRuntimeProvider } from "@/features/newsletter/runtime";
import { SenderStatusNotice } from "@/features/newsletter";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { mockActiveUser, renderWithQueryClient } from "@/specs/test-utils";

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

const fetchMock = vi.fn();
const json = (status: number, body: unknown) => Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
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

const render = (ui: ReactElement) => renderWithQueryClient(<NewsletterRuntimeProvider configured>{ui}</NewsletterRuntimeProvider>);

/** vision-web#1513: the suspension is visible to the sender, and only when there is one to see. */
describe("SenderStatusNotice", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    flags.newsletter = true;
    loggedIn("alice");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows the suspension, its reason and since when, to the sender", async () => {
    fetchMock.mockReturnValue(json(200, standing({ status: "suspended", reason: "complaint_rate", since: "2026-08-18T13:00:00Z" })));
    render(<SenderStatusNotice type="creator" target="alice" isSender />);
    const notice = await screen.findByTestId("newsletter-sender-suspended");
    expect(notice).toHaveTextContent("newsletter.suspended-title-creator");
    expect(notice).toHaveTextContent("newsletter.suspended-reason-complaints");
    expect(notice).toHaveTextContent("newsletter.suspended-help");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/newsletter/sender?type=creator&target=alice");
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ "X-HS-Token": "mock-token" });
  });

  it("renders nothing while the sender is in good standing, and says why for a bounce suspension of a community", async () => {
    fetchMock.mockReturnValue(json(200, standing({ status: "active" })));
    const { container, unmount } = render(<SenderStatusNotice type="creator" target="alice" isSender />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(container.querySelector("[data-testid=newsletter-sender-suspended]")).toBeNull();
    unmount();
    fetchMock.mockReturnValue(json(200, standing({ type: "community", target: "hive-125125", status: "suspended", reason: "bounce_rate", since: "2026-08-18T13:00:00Z" })));
    render(<SenderStatusNotice type="community" target="hive-125125" isSender />);
    const notice = await screen.findByTestId("newsletter-sender-suspended");
    expect(notice).toHaveTextContent("newsletter.suspended-title-community");
    expect(notice).toHaveTextContent("newsletter.suspended-reason-bounces");
  });

  it("never asks when the viewer is not the sender, is logged out, or the feature is off", async () => {
    fetchMock.mockReturnValue(json(200, standing({ status: "suspended", reason: "manual" })));
    const { container: c1, unmount: u1 } = render(<SenderStatusNotice type="creator" target="alice" isSender={false} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(c1.textContent).toBe("");
    u1();
    loggedIn(null);
    const { unmount: u2 } = render(<SenderStatusNotice type="creator" target="alice" isSender />);
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchMock).not.toHaveBeenCalled();
    u2();
    loggedIn("alice");
    flags.newsletter = false;
    render(<SenderStatusNotice type="creator" target="alice" isSender />);
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

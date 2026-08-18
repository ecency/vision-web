import "@testing-library/jest-dom";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { NewsletterRuntimeProvider } from "@/features/newsletter/runtime";
import { DigestSubscribeButton, PostSubscribePrompt, SubscriberCount, digestSubscriptionsKey, subscribeLinkFor } from "@/features/newsletter";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { cleanupModalContainers, createTestQueryClient, mockActiveUser, mockEntry, renderWithQueryClient, setupModalContainers } from "@/specs/test-utils";

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
const render = (ui: ReactElement, client = createTestQueryClient()) =>
  renderWithQueryClient(<NewsletterRuntimeProvider configured>{ui}</NewsletterRuntimeProvider>, { queryClient: client });
const standing = (subscribers: { weekly: number; monthly: number }) => ({
  type: "creator",
  target: "alice",
  status: "active",
  reason: null,
  since: null,
  stats: { delivered: 0, bounced: 0, rejected: 0, complaints: 0, unsubscribed: 0, complaintRate: 0, bounceRate: 0 },
  subscribers
});

describe("list building (vision-web#1537)", () => {
  beforeEach(() => {
    setupModalContainers();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    window.history.replaceState(null, "", "/@alice");
    flags.newsletter = true;
    loggedIn("alice");
  });
  afterEach(() => {
    cleanupModalContainers();
    vi.unstubAllGlobals();
  });

  it("subscribeLinkFor points at the list's own page with the opener parameter", () => {
    expect(subscribeLinkFor("creator", "alice")).toBe("/@alice?subscribe=digest");
    expect(subscribeLinkFor("community", "hive-125125", "https://ecency.com")).toBe("https://ecency.com/created/hive-125125?subscribe=digest");
  });

  it("shows the sender their subscriber count and copies the subscribe link; nothing for a non-sender", async () => {
    fetchMock.mockReturnValue(json(200, standing({ weekly: 12, monthly: 3 })));
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<SubscriberCount type="creator" target="alice" isSender />);
    await waitFor(() => expect(screen.getByText("newsletter.subscriber-count")).toBeInTheDocument());
    expect(screen.getByText("newsletter.subscriber-count-split")).toBeInTheDocument();
    fireEvent.click(screen.getByText("newsletter.copy-subscribe-link"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/@alice\?subscribe=digest$/)));
    fetchMock.mockReset();
    const { container } = render(<SubscriberCount type="creator" target="alice" isSender={false} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(container.textContent).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a shared link (?subscribe=digest) opens the subscribe dialog once and cleans the URL", async () => {
    window.history.replaceState(null, "", "/@alice?subscribe=digest&x=1");
    fetchMock.mockReturnValue(json(200, { subscriptions: [] }));
    const client = createTestQueryClient();
    client.setQueryData(["accounts", "pro-members"], { members: ["alice"] });
    render(<DigestSubscribeButton type="creator" target="alice" targetLabel="@alice" source="creator-page" />, client);
    // The dialog is open, and the parameter is gone while the rest of the query is kept.
    await waitFor(() => expect(window.location.search).toBe("?x=1"));
    const dialog = document.querySelector("#modal-dialog-container") as HTMLElement;
    await waitFor(() => expect(within(dialog).getByText("newsletter.intro-creator")).toBeInTheDocument());
  });

  it("at the end of a post, offers the author's digest to a signed-in reader who is not subscribed; remembers 'Not now'; nothing for the author, a subscriber, or when signed out", async () => {
    const client = createTestQueryClient();
    client.setQueryData(["accounts", "pro-members"], { members: ["bob"] });
    client.setQueryData(digestSubscriptionsKey("alice"), []);
    const entry = mockEntry({ author: "bob", permlink: "hello", category: "photography", parent_author: "", depth: 0 });
    window.localStorage.clear();
    const { unmount } = render(<PostSubscribePrompt entry={entry} />, client);
    await screen.findByRole("region", { name: "newsletter.post-prompt-title" });
    expect(screen.getByText("newsletter.post-prompt-body-creator")).toBeInTheDocument();
    fireEvent.click(screen.getByText("newsletter.post-prompt-dismiss"));
    expect(screen.queryByRole("region")).toBeNull();
    expect(window.localStorage.getItem("ecency:digest-post-prompt:alice:creator:bob")).toBe("1");
    unmount();
    // Remembered.
    const { container: c1, unmount: u1 } = render(<PostSubscribePrompt entry={entry} />, client);
    await new Promise((r) => setTimeout(r, 30));
    expect(c1.textContent).toBe("");
    u1();
    window.localStorage.clear();
    // Already subscribed: nothing.
    client.setQueryData(digestSubscriptionsKey("alice"), [{ id: "1", type: "creator", target: "bob", cadence: "weekly", status: "active", email: "a@e.com" }]);
    const { container: c2, unmount: u2 } = render(<PostSubscribePrompt entry={entry} />, client);
    await new Promise((r) => setTimeout(r, 30));
    expect(c2.textContent).toBe("");
    u2();
    client.setQueryData(digestSubscriptionsKey("alice"), []);
    // The author reading their own post: nothing (no community either).
    loggedIn("bob");
    client.setQueryData(digestSubscriptionsKey("bob"), []);
    const { container: c3, unmount: u3 } = render(<PostSubscribePrompt entry={entry} />, client);
    await new Promise((r) => setTimeout(r, 30));
    expect(c3.textContent).toBe("");
    u3();
    // Signed out: nothing.
    loggedIn(null);
    const { container: c4 } = render(<PostSubscribePrompt entry={entry} />, client);
    await new Promise((r) => setTimeout(r, 30));
    expect(c4.textContent).toBe("");
  });

  it("falls back to the community's digest for a post made in a community when the author is not Pro", async () => {
    const client = createTestQueryClient();
    client.setQueryData(["accounts", "pro-members"], { members: [] });
    client.setQueryData(digestSubscriptionsKey("alice"), []);
    window.localStorage.clear();
    const entry = mockEntry({ author: "bob", permlink: "p", category: "hive-125125", parent_author: "", depth: 0 });
    render(<PostSubscribePrompt entry={entry} communityTitle="Town Square" />, client);
    await screen.findByRole("region", { name: "newsletter.post-prompt-title" });
    expect(screen.getByText("newsletter.post-prompt-body-community")).toBeInTheDocument();
    // A comment gets no prompt.
    const comment = mockEntry({ author: "bob", permlink: "re", category: "hive-125125", parent_author: "x", depth: 1 });
    const { container } = render(<PostSubscribePrompt entry={comment} />, client);
    await new Promise((r) => setTimeout(r, 30));
    expect(container.textContent).toBe("");
  });
});

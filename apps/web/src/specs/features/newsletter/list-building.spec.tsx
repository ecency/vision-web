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
// None of these components looks up an entitlement: the community query is the
// only SDK call they make, and it answers with a title.
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<object>("@ecency/sdk")),
  getCommunityQueryOptions: (name: string) => ({ queryKey: ["community", name], queryFn: async () => ({ name, title: "Town Square", team: [] }) })
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
    window.history.replaceState(null, "", "/");
    window.localStorage.clear();
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

  it("when the clipboard is unavailable, the link is shown as selectable text instead", async () => {
    fetchMock.mockReturnValue(json(200, standing({ weekly: 1, monthly: 0 })));
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    render(<SubscriberCount type="creator" target="alice" isSender />);
    await waitFor(() => expect(screen.getByText("newsletter.copy-subscribe-link")).toBeInTheDocument());
    fireEvent.click(screen.getByText("newsletter.copy-subscribe-link"));
    const field = (await screen.findByLabelText("newsletter.subscribe-link")) as HTMLInputElement;
    expect(field.value).toMatch(/\/@alice\?subscribe=digest$/);
    expect(field.readOnly).toBe(true);
  });

  it("a shared link (?subscribe=digest) opens the subscribe dialog once and cleans the URL", async () => {
    window.history.replaceState(null, "", "/@alice?subscribe=digest&x=1");
    fetchMock.mockReturnValue(json(200, { subscriptions: [] }));
    const client = createTestQueryClient();
    render(<DigestSubscribeButton type="creator" target="alice" targetLabel="@alice" source="creator-page" />, client);
    // The dialog is open, and the parameter is gone while the rest of the query is kept.
    await waitFor(() => expect(window.location.search).toBe("?x=1"));
    const dialog = document.querySelector("#modal-dialog-container") as HTMLElement;
    await waitFor(() => expect(within(dialog).getByText("newsletter.intro-creator")).toBeInTheDocument());
  });

  it("a shared creator link opens for any creator at once: no roster involved (2026-08-19)", async () => {
    window.history.replaceState(null, "", "/@bob?subscribe=digest");
    fetchMock.mockReturnValue(json(200, { subscriptions: [] }));
    const client = createTestQueryClient();
    render(<DigestSubscribeButton type="creator" target="bob" targetLabel="@bob" source="creator-page" />, client);
    await waitFor(() => expect(window.location.search).toBe(""));
    const dialog = document.querySelector("#modal-dialog-container") as HTMLElement;
    await waitFor(() => expect(within(dialog).getByText("newsletter.intro-creator")).toBeInTheDocument());
    // With the feature off, the link is left alone.
    window.history.replaceState(null, "", "/@carol?subscribe=digest");
    flags.newsletter = false;
    render(<DigestSubscribeButton type="creator" target="carol" targetLabel="@carol" source="creator-page" />, createTestQueryClient());
    await new Promise((r) => setTimeout(r, 50));
    expect(window.location.search).toBe("?subscribe=digest");
  });

  it("at the end of a post, offers the author's digest to a signed-in reader who is not subscribed; remembers 'Not now'; nothing for the author or a subscriber", async () => {
    const client = createTestQueryClient();
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
  });

  it("offers the author's digest to an ANONYMOUS reader, and remembers a dismissal under its own key", async () => {
    // Anonymous readers are the larger half of a post's audience and the half with no
    // other way to hear about the next post. There is no subscription list to consult
    // for them, so the card is offered rather than withheld; the subscribe path already
    // serves them with double opt-in plus a bot check on the relay.
    loggedIn(null);
    const client = createTestQueryClient();
    const entry = mockEntry({ author: "bob", permlink: "hello", category: "photography", parent_author: "", depth: 0 });
    window.localStorage.clear();

    const { unmount } = render(<PostSubscribePrompt entry={entry} />, client);
    await screen.findByRole("region", { name: "newsletter.post-prompt-title" });
    expect(screen.getByText("newsletter.post-prompt-body-creator")).toBeInTheDocument();

    fireEvent.click(screen.getByText("newsletter.post-prompt-dismiss"));
    expect(screen.queryByRole("region")).toBeNull();
    // Its own namespace: an empty viewer segment would read `...prompt::creator:bob`.
    expect(window.localStorage.getItem("ecency:digest-post-prompt:anon:creator:bob")).toBe("1");
    unmount();

    const { container } = render(<PostSubscribePrompt entry={entry} />, client);
    await new Promise((r) => setTimeout(r, 30));
    expect(container.textContent).toBe("");
  });

  it("never asks the service for an anonymous reader's subscriptions", async () => {
    // The subscriptions endpoint needs the account's token, newsletterApi.list throws
    // without a username, and one shared cache key would collapse every anonymous
    // visitor onto a single entry. The anon path skips the query rather than enabling it.
    loggedIn(null);
    const client = createTestQueryClient();
    const entry = mockEntry({ author: "bob", permlink: "hello", category: "photography", parent_author: "", depth: 0 });
    window.localStorage.clear();
    render(<PostSubscribePrompt entry={entry} />, client);
    await screen.findByRole("region", { name: "newsletter.post-prompt-title" });
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).includes("/api/newsletter/subscriptions"))
    ).toHaveLength(0);
  });

  it("treats a stored username whose account record is gone as anonymous, not as pending hydration", async () => {
    // authentication-module only produces an active user when active_user AND its
    // user_<name> record are both present, and it writes the name back regardless. A
    // marker without its record therefore never becomes an active user, so waiting on it
    // would hide the prompt from that visitor permanently with nothing to explain it.
    loggedIn(null);
    window.localStorage.clear();
    window.localStorage.setItem("ecency_active_user", "alice"); // marker, no ecency_user_alice
    const client = createTestQueryClient();
    const entry = mockEntry({ author: "bob", permlink: "hello", category: "photography", parent_author: "", depth: 0 });
    render(<PostSubscribePrompt entry={entry} />, client);
    await screen.findByRole("region", { name: "newsletter.post-prompt-title" });
    window.localStorage.clear();
  });

  it("renders nothing while a signed-in reader's store is still hydrating", async () => {
    // activeUser is null on the first client render for a signed-in reader too, because
    // the store is populated in a post-mount effect. Rendering the anonymous card then
    // would flash it at subscribers and write an "anon" dismissal for someone who is
    // actually signed in, so a stored user with no activeUser yet renders nothing.
    loggedIn(null);
    window.localStorage.clear();
    // Both keys, because only the pair is a hydration in flight: the store requires
    // active_user AND the user_<name> record before it yields an active user.
    window.localStorage.setItem("ecency_active_user", "alice");
    window.localStorage.setItem("ecency_user_alice", JSON.stringify({ username: "alice" }));
    const client = createTestQueryClient();
    const entry = mockEntry({ author: "bob", permlink: "hello", category: "photography", parent_author: "", depth: 0 });
    const { container } = render(<PostSubscribePrompt entry={entry} />, client);
    await new Promise((r) => setTimeout(r, 30));
    expect(container.textContent).toBe("");
    window.localStorage.clear();
  });

  it("offers the community's digest when the author reads their own post in a community; the title comes from the community query", async () => {
    loggedIn("bob");
    const client = createTestQueryClient();
    client.setQueryData(digestSubscriptionsKey("bob"), []);
    window.localStorage.clear();
    const entry = mockEntry({ author: "bob", permlink: "p", category: "hive-125125", parent_author: "", depth: 0 });
    const { unmount: u0 } = render(<PostSubscribePrompt entry={entry} />, client);
    await screen.findByRole("region", { name: "newsletter.post-prompt-title" });
    expect(screen.getByText("newsletter.post-prompt-body-community")).toBeInTheDocument();
    // The community's title comes from the community query when the page did not pass it.
    await waitFor(() => expect(screen.getByText("newsletter.post-prompt-subscribe")).toBeInTheDocument());
    fireEvent.click(screen.getByText("newsletter.post-prompt-subscribe"));
    const dialog = document.querySelector("#modal-dialog-container") as HTMLElement;
    await waitFor(() => expect(within(dialog).getByText("newsletter.intro-community")).toBeInTheDocument());
    // While the dialog is open, a subscription appearing (the refetch after subscribing) hides
    // the card but keeps the dialog, so its "check your inbox" outcome is not lost.
    client.setQueryData(digestSubscriptionsKey("bob"), [{ id: "1", type: "community", target: "hive-125125", cadence: "weekly", status: "pending_confirmation", email: "a@e.com" }]);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("region")).toBeNull();
    // Still mounted, now showing the pending state the dialog reads from the fresh subscription.
    expect(within(dialog).getByText("newsletter.status-pending")).toBeInTheDocument();
    u0();
    client.setQueryData(digestSubscriptionsKey("bob"), []);
    // A comment gets no prompt.
    const comment = mockEntry({ author: "bob", permlink: "re", category: "hive-125125", parent_author: "x", depth: 1 });
    const { container } = render(<PostSubscribePrompt entry={comment} />, client);
    await new Promise((r) => setTimeout(r, 30));
    expect(container.textContent).toBe("");
  });
});

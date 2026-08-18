import "@testing-library/jest-dom";
import { fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { NewsletterRuntimeProvider } from "@/features/newsletter/runtime";
import { AuthorSendDialog, SentIssues, useAuthorSendTarget } from "@/features/newsletter";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import type { Community } from "@/entities";
import {
  cleanupModalContainers,
  createTestQueryClient,
  mockActiveUser,
  mockEntry,
  renderWithQueryClient,
  setupModalContainers
} from "@/specs/test-utils";

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

const community = { name: "hive-125125", title: "Town Square", team: [["owner1", "owner", ""], ["alice", "admin", ""], ["mia", "mod", ""]] } as unknown as Community;
const target = { type: "creator" as const, target: "alice", label: "@alice" };
const preview = (over: Record<string, unknown> = {}) => ({
  subject: "Hello world",
  html: "<html><body><p>Hello</p></body></html>",
  text: "Hello",
  post: { author: "alice", permlink: "hello", title: "Hello world" },
  subscribers: { weekly: 12, monthly: 3 },
  alreadySent: [],
  ...over
});

const wrap = (client: ReturnType<typeof createTestQueryClient>) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <NewsletterRuntimeProvider configured>{children}</NewsletterRuntimeProvider>
      </QueryClientProvider>
    );
  };
const render = (ui: ReactElement, client = createTestQueryClient()) =>
  renderWithQueryClient(<NewsletterRuntimeProvider configured>{ui}</NewsletterRuntimeProvider>, { queryClient: client });

describe("useAuthorSendTarget", () => {
  beforeEach(() => {
    flags.newsletter = true;
    loggedIn("alice");
  });

  it("offers a Pro creator their own top-level post, and a community's owner/admin a post made there; nobody else", () => {
    const client = createTestQueryClient();
    client.setQueryData(["accounts", "pro-members"], { members: ["alice"] });
    const own = mockEntry({ author: "alice", permlink: "hello", category: "photography", parent_author: "", depth: 0 });
    expect(renderHook(() => useAuthorSendTarget(own, null), { wrapper: wrap(client) }).result.current).toEqual(target);
    // In a community she administers, the community list wins for that post.
    const inCommunity = mockEntry({ author: "bob", permlink: "p", category: "hive-125125", parent_author: "", depth: 0 });
    expect(renderHook(() => useAuthorSendTarget(inCommunity, community), { wrapper: wrap(client) }).result.current).toEqual({
      type: "community",
      target: "hive-125125",
      label: "Town Square"
    });
    // A comment, never.
    const comment = mockEntry({ author: "alice", permlink: "re", category: "photography", parent_author: "bob", depth: 1 });
    expect(renderHook(() => useAuthorSendTarget(comment, null), { wrapper: wrap(client) }).result.current).toBeNull();
    // Not Pro: own post not offered; still may send as community admin.
    client.setQueryData(["accounts", "pro-members"], { members: ["someone-else"] });
    expect(renderHook(() => useAuthorSendTarget(own, null), { wrapper: wrap(client) }).result.current).toBeNull();
    expect(renderHook(() => useAuthorSendTarget(inCommunity, community), { wrapper: wrap(client) }).result.current?.type).toBe("community");
    // A mod: no. Someone else's post outside a community she runs: no. Logged out: no. Feature off: no.
    loggedIn("mia");
    expect(renderHook(() => useAuthorSendTarget(inCommunity, community), { wrapper: wrap(client) }).result.current).toBeNull();
    loggedIn("alice");
    expect(renderHook(() => useAuthorSendTarget(mockEntry({ author: "bob", permlink: "q", category: "photography", parent_author: "", depth: 0 }), null), { wrapper: wrap(client) }).result.current).toBeNull();
    loggedIn(null);
    expect(renderHook(() => useAuthorSendTarget(own, null), { wrapper: wrap(client) }).result.current).toBeNull();
    loggedIn("alice");
    flags.newsletter = false;
    client.setQueryData(["accounts", "pro-members"], { members: ["alice"] });
    expect(renderHook(() => useAuthorSendTarget(own, null), { wrapper: wrap(client) }).result.current).toBeNull();
  });
});

describe("AuthorSendDialog", () => {
  beforeEach(() => {
    setupModalContainers();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    flags.newsletter = true;
    loggedIn("alice");
  });
  afterEach(() => {
    cleanupModalContainers();
    vi.unstubAllGlobals();
  });

  it("previews, states the readers and the one-per-period rule, sends, and reports what went out", async () => {
    fetchMock.mockImplementation((url: string) =>
      url.endsWith("/preview") ? json(200, preview()) : json(201, { issues: [{ issueId: "i1", cadence: "weekly", period: "2026-08-17", send: { recipients: 12, sent: 12, pending: 0 } }, { issueId: "i2", cadence: "monthly", period: "2026-08-01", send: { recipients: 3, sent: 3, pending: 0 } }] })
    );
    render(<AuthorSendDialog target={target} author="alice" permlink="hello" show onHide={() => {}} />);
    await waitFor(() => expect(screen.getByText("Hello world")).toBeInTheDocument());
    expect(screen.getByText("newsletter.send-readers")).toBeInTheDocument();
    expect(screen.getByText("newsletter.send-one-per-period")).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/newsletter/send/preview");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ type: "creator", target: "alice", author: "alice", permlink: "hello" });
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    expect(iframe.getAttribute("sandbox")).toBe("");
    expect(iframe.getAttribute("srcdoc")).toContain("Hello");
    fireEvent.click(screen.getByText("newsletter.send-now"));
    await waitFor(() => expect(screen.getByText("newsletter.send-done")).toBeInTheDocument());
    expect(fetchMock.mock.calls[1][0]).toBe("/api/newsletter/send");
    expect(screen.getAllByText("newsletter.send-done-line")).toHaveLength(2);
  });

  it("when this period's issue already went out for every cadence, says so and offers no send; a partial take-over is stated and still sends", async () => {
    fetchMock.mockImplementation(() => json(200, preview({ alreadySent: ["weekly", "monthly"] })));
    const { unmount } = render(<AuthorSendDialog target={target} author="alice" permlink="hello" show onHide={() => {}} />);
    await waitFor(() => expect(screen.getByText("newsletter.send-period-taken-all")).toBeInTheDocument());
    expect(screen.getByText("newsletter.send-now").closest("button")).toBeDisabled();
    unmount();
    fetchMock.mockImplementation((url: string) => (url.endsWith("/preview") ? json(200, preview({ alreadySent: ["weekly"] })) : json(201, { issues: [{ issueId: "i2", cadence: "monthly", period: "2026-08-01", send: { recipients: 3, sent: 3, pending: 0 } }] })));
    render(<AuthorSendDialog target={target} author="alice" permlink="hello" show onHide={() => {}} />);
    await waitFor(() => expect(screen.getByText("newsletter.send-period-taken-some")).toBeInTheDocument());
    expect(screen.getByText("newsletter.send-now").closest("button")).not.toBeDisabled();
  });

  it("shows the service's refusals for what they are: taken, suspended, post refused, not allowed, unavailable", async () => {
    const cases: Array<[number, Record<string, unknown>, string]> = [
      [409, { error: "taken", code: "already_sent" }, "newsletter.send-already-sent"],
      [403, { error: "suspended", code: "suspended" }, "newsletter.send-suspended"],
      [422, { error: "the post is tagged nsfw", code: "post_refused" }, "newsletter.send-post-refused"],
      [403, { error: "sending to a creator digest is an Ecency Pro capability" }, "newsletter.send-not-allowed"],
      [503, { error: "not configured" }, "newsletter.error-unavailable"]
    ];
    for (const [status, body, key] of cases) {
      fetchMock.mockImplementation((url: string) => (url.endsWith("/preview") ? json(200, preview()) : json(status, body)));
      const { unmount } = render(<AuthorSendDialog target={target} author="alice" permlink="hello" show onHide={() => {}} />);
      await waitFor(() => expect(screen.getByText("newsletter.send-now")).toBeInTheDocument());
      fireEvent.click(screen.getByText("newsletter.send-now"));
      await waitFor(() => expect(screen.getByText(key)).toBeInTheDocument());
      if (status === 422) expect(screen.getByText("the post is tagged nsfw")).toBeInTheDocument();
      unmount();
    }
    // A refused preview shows the reason too, and no send button.
    fetchMock.mockImplementation(() => json(422, { error: "the post is not by this creator", code: "post_refused" }));
    render(<AuthorSendDialog target={target} author="alice" permlink="hello" show onHide={() => {}} />);
    await waitFor(() => expect(screen.getByText("newsletter.send-post-refused")).toBeInTheDocument());
    expect(screen.queryByText("newsletter.send-now")).toBeNull();
  });
});

describe("SentIssues", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    flags.newsletter = true;
    loggedIn("alice");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lists the sender's issues with what became of them; nothing for a non-sender, nothing when empty", async () => {
    fetchMock.mockReturnValue(
      json(200, {
        issues: [
          { id: "1", cadence: "weekly", kind: "post", period_start: "2026-08-17", subject: "Hello world", status: "sent", post_author: "alice", post_permlink: "hello", requested_by: "alice", created_at: "2026-08-19T10:00:00Z", delivered: 12, bounced: 1, rejected: 0 },
          { id: "2", cadence: "weekly", kind: "digest", period_start: "2026-08-10", subject: "@alice's weekly digest: 3 new posts", status: "sent", post_author: null, post_permlink: null, requested_by: null, created_at: "2026-08-17T09:00:00Z", delivered: 11, bounced: 0, rejected: 1 }
        ]
      })
    );
    render(<SentIssues type="creator" target="alice" isSender />);
    const list = await screen.findByTestId("newsletter-sent-issues");
    expect(list).toHaveTextContent("Hello world");
    expect(list.querySelector('a[href="/@alice/hello"]')).not.toBeNull();
    expect(list).toHaveTextContent("@alice's weekly digest: 3 new posts");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/newsletter/issues?type=creator&target=alice");
    fetchMock.mockReset();
    const { container } = render(<SentIssues type="creator" target="alice" isSender={false} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toBe("");
    fetchMock.mockReturnValue(json(200, { issues: [] }));
    const { container: c2 } = render(<SentIssues type="community" target="hive-125125" isSender />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(c2.textContent).toBe("");
  });
});

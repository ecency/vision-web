import "@testing-library/jest-dom";
import { fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { NewsletterRuntimeProvider } from "@/features/newsletter/runtime";
import { AuthorSendDialog, candidatesKey, communityDigestRoles, ComposeDigestButton, ComposeDigestDialog, sendPreviewKey, SentIssues, useAuthorSendTarget } from "@/features/newsletter";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import {
  cleanupModalContainers,
  createTestQueryClient,
  mockActiveUser,
  mockCommunity,
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

const community = mockCommunity({ name: "hive-125125", title: "Town Square", team: [["owner1", "owner", ""], ["alice", "admin", ""], ["mia", "mod", ""]] });
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
    const iframe = document.querySelector("iframe") as HTMLIFrameElement;
    expect(iframe.getAttribute("sandbox")).toBe("");
    expect(iframe.getAttribute("srcdoc")).toContain("Hello");
    fireEvent.click(screen.getByText("newsletter.send-now"));
    await waitFor(() => expect(screen.getByText("newsletter.send-done")).toBeInTheDocument());
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
      [409, { error: "taken", code: "already_sent", taken: [{ cadence: "weekly", period: "2026-08-17", kind: "digest" }] }, "newsletter.send-already-sent"],
      [404, { error: "post not found", code: "post_not_found" }, "newsletter.send-post-not-found"],
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
      if (status === 409) {
        // The conflict says which period is taken and by what, and points at the history.
        expect(screen.getByText("newsletter.send-taken-line")).toBeInTheDocument();
        expect(screen.getByText("newsletter.send-see-history").closest("a")).toHaveAttribute("href", "/@alice");
      }
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
    const list = await screen.findByRole("list", { name: "newsletter.sent-issues" });
    expect(list).toHaveTextContent("Hello world");
    expect(list.querySelector('a[href="/@alice/hello"]')).not.toBeNull();
    expect(list).toHaveTextContent("@alice's weekly digest: 3 new posts");
    // Bounced and rejected are different outcomes and are shown as such.
    expect(list).toHaveTextContent("newsletter.sent-issue-stats");
    expect(screen.getAllByText(/newsletter.sent-issue-rejected/)).toHaveLength(1);
    fetchMock.mockReset();
    const { container } = render(<SentIssues type="creator" target="alice" isSender={false} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toBe("");
    fetchMock.mockReturnValue(json(200, { issues: [] }));
    const { container: c2, unmount } = render(<SentIssues type="community" target="hive-125125" isSender />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(c2.textContent).toBe("");
    unmount();
    // A failed load is not "nothing sent yet".
    fetchMock.mockReturnValue(json(503, { error: "down" }));
    render(<SentIssues type="creator" target="alice" isSender />);
    await waitFor(() => expect(screen.getByText("newsletter.sent-issues-unavailable")).toBeInTheDocument());
  });
});

describe("ComposeDigestDialog", () => {
  const candidates = [
    { author: "alice", permlink: "one", title: "One", created: "2026-08-17T09:00:00Z", featured: false },
    { author: "alice", permlink: "two", title: "Two", created: "2026-08-16T09:00:00Z", featured: true },
    { author: "alice", permlink: "three", title: "Three", created: "2026-08-15T09:00:00Z", featured: false }
  ];
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

  it("picks 2..10 posts in the sender's order, takes subject and intro, then hands the composition to the send flow", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith("/api/newsletter/posts")) return json(200, { posts: candidates });
      if (url.endsWith("/preview")) return json(200, preview({ subject: "Two things", posts: [{ author: "alice", permlink: "two", title: "Two" }, { author: "alice", permlink: "one", title: "One" }] }));
      return json(201, { issues: [{ issueId: "i1", cadence: "weekly", period: "2026-08-17", send: { recipients: 12, sent: 12, pending: 0 } }] });
    });
    render(<ComposeDigestDialog target={target} show onHide={() => {}} />);
    await screen.findByRole("list", { name: "newsletter.compose-pick" });
    expect(screen.getByText(/newsletter.compose-featured/)).toBeInTheDocument();
    const cont = () => screen.getByText("newsletter.compose-continue").closest("button")!;
    expect(cont()).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Two"));
    expect(cont()).toBeDisabled(); // one is not enough
    fireEvent.click(screen.getByLabelText("One"));
    expect(cont()).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText("newsletter.compose-subject"), { target: { value: "Two things" } });
    fireEvent.change(screen.getByLabelText("newsletter.compose-intro"), { target: { value: "Hi all" } });
    fireEvent.click(cont());
    // The send flow previews the composition: picked order (Two, then One), subject and intro travel with it.
    await waitFor(() => expect(screen.getByText("Two things")).toBeInTheDocument());
    const previewCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/preview"))!;
    expect(JSON.parse(previewCall[1].body)).toEqual({
      type: "creator",
      target: "alice",
      posts: [{ author: "alice", permlink: "two" }, { author: "alice", permlink: "one" }],
      subject: "Two things",
      intro: "Hi all"
    });
    // Back returns to the picker with the choices kept.
    fireEvent.click(screen.getByText("g.back"));
    await screen.findByRole("list", { name: "newsletter.compose-pick" });
    expect((screen.getByLabelText("Two") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(cont());
    await waitFor(() => expect(screen.getByText("newsletter.send-now")).toBeInTheDocument());
    fireEvent.click(screen.getByText("newsletter.send-now"));
    await waitFor(() => expect(screen.getByText("newsletter.send-done")).toBeInTheDocument());
  });

  it("a refused preview offers the way back to the picker; the picks and text survive", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith("/api/newsletter/posts")) return json(200, { posts: candidates });
      return json(422, { error: "@alice/two: the post is tagged nsfw", code: "post_refused" });
    });
    render(<ComposeDigestDialog target={target} show onHide={() => {}} />);
    await screen.findByRole("list", { name: "newsletter.compose-pick" });
    fireEvent.click(screen.getByLabelText("Two"));
    fireEvent.click(screen.getByLabelText("One"));
    fireEvent.change(screen.getByLabelText("newsletter.compose-subject"), { target: { value: "Two things" } });
    fireEvent.click(screen.getByText("newsletter.compose-continue"));
    await waitFor(() => expect(screen.getByText("newsletter.send-post-refused")).toBeInTheDocument());
    expect(screen.getByText("@alice/two: the post is tagged nsfw")).toBeInTheDocument();
    expect(screen.queryByText("newsletter.send-now")).toBeNull();
    fireEvent.click(screen.getByText("g.back"));
    await screen.findByRole("list", { name: "newsletter.compose-pick" });
    expect((screen.getByLabelText("Two") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("newsletter.compose-subject") as HTMLInputElement).value).toBe("Two things");
    // The offending post can be swapped out.
    fireEvent.click(screen.getByLabelText("Two"));
    fireEvent.click(screen.getByLabelText("Three"));
    expect(screen.getByText("newsletter.compose-continue").closest("button")).not.toBeDisabled();
  });

  it("picks that no longer resolve to a candidate do not count towards the minimum", async () => {
    fetchMock.mockImplementation(() => json(200, { posts: candidates }));
    const client = createTestQueryClient();
    render(<ComposeDigestDialog target={target} show onHide={() => {}} />, client);
    await screen.findByRole("list", { name: "newsletter.compose-pick" });
    fireEvent.click(screen.getByLabelText("Two"));
    fireEvent.click(screen.getByLabelText("One"));
    const cont = () => screen.getByText("newsletter.compose-continue").closest("button")!;
    expect(cont()).not.toBeDisabled();
    // The list refreshes without "Two": one live pick is not enough to continue.
    client.setQueryData(candidatesKey("creator", "alice", "alice"), candidates.filter((c) => c.permlink !== "two"));
    await waitFor(() => expect(cont()).toBeDisabled());
  });

  it("a sent composition invalidates the candidates, so the featured marks refresh on the next open", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith("/api/newsletter/posts")) return json(200, { posts: candidates });
      if (url.endsWith("/preview")) return json(200, preview({ subject: "Two things" }));
      return json(201, { issues: [{ issueId: "i1", cadence: "weekly", period: "2026-08-17", send: { recipients: 12, sent: 12, pending: 0 } }] });
    });
    const client = createTestQueryClient();
    render(<ComposeDigestDialog target={target} show onHide={() => {}} />, client);
    await screen.findByRole("list", { name: "newsletter.compose-pick" });
    fireEvent.click(screen.getByLabelText("Two"));
    fireEvent.click(screen.getByLabelText("One"));
    fireEvent.click(screen.getByText("newsletter.compose-continue"));
    await waitFor(() => expect(screen.getByText("newsletter.send-now")).toBeInTheDocument());
    const candidateFetches = () => fetchMock.mock.calls.filter((c) => String(c[0]).startsWith("/api/newsletter/posts")).length;
    expect(candidateFetches()).toBe(1);
    fireEvent.click(screen.getByText("newsletter.send-now"));
    await waitFor(() => expect(screen.getByText("newsletter.send-done")).toBeInTheDocument());
    // The candidates query is still mounted behind the send flow, so the invalidation refetches it at once.
    await waitFor(() => expect(candidateFetches()).toBe(2));
    expect(client.getQueryState(candidatesKey("creator", "alice", "alice"))?.status).toBe("success");
  });

  it("the preview's cache key tells compositions apart even when subject and intro share text", () => {
    const base = { type: "creator" as const, target: "alice", posts: [{ author: "alice", permlink: "one" }, { author: "alice", permlink: "two" }] };
    const a = sendPreviewKey({ ...base, subject: "A|B", intro: "C" }, "alice");
    const b = sendPreviewKey({ ...base, subject: "A", intro: "B|C" }, "alice");
    const c = sendPreviewKey({ ...base, subject: "A|B", intro: "C" }, "alice");
    expect(a).not.toEqual(b);
    expect(a).toEqual(c);
    expect(sendPreviewKey({ ...base, posts: [base.posts[1], base.posts[0]] }, "alice")).not.toEqual(a);
    expect(sendPreviewKey({ type: "creator", target: "alice", author: "alice", permlink: "one" }, "alice")).not.toEqual(sendPreviewKey({ ...base, posts: [base.posts[0]] }, "alice"));
  });

  it("says when there are no candidates or they could not be loaded", async () => {
    fetchMock.mockImplementation(() => json(200, { posts: [] }));
    const { unmount } = render(<ComposeDigestDialog target={target} show onHide={() => {}} />);
    await waitFor(() => expect(screen.getByText("newsletter.compose-no-candidates")).toBeInTheDocument());
    unmount();
    fetchMock.mockImplementation(() => json(503, { error: "down" }));
    render(<ComposeDigestDialog target={target} show onHide={() => {}} />);
    await waitFor(() => expect(screen.getByText("newsletter.compose-candidates-unavailable")).toBeInTheDocument());
  });
});

describe("communityDigestRoles", () => {
  it("owner and admin may view and send, a mod may only view, anyone else neither; names match regardless of case", () => {
    const team = [["owner1", "owner", ""], ["Alice", "admin", ""], ["mia", "mod", ""], ["bob", "member", ""]];
    expect(communityDigestRoles(team, "owner1")).toEqual({ canView: true, canSend: true });
    expect(communityDigestRoles(team, "alice")).toEqual({ canView: true, canSend: true });
    expect(communityDigestRoles(team, "ALICE")).toEqual({ canView: true, canSend: true });
    expect(communityDigestRoles(team, "MIA")).toEqual({ canView: true, canSend: false });
    expect(communityDigestRoles(team, "bob")).toEqual({ canView: false, canSend: false });
    expect(communityDigestRoles(team, "stranger")).toEqual({ canView: false, canSend: false });
    expect(communityDigestRoles(team, null)).toEqual({ canView: false, canSend: false });
    expect(communityDigestRoles(team, "")).toEqual({ canView: false, canSend: false });
    expect(communityDigestRoles(undefined, "owner1")).toEqual({ canView: false, canSend: false });
    expect(communityDigestRoles([["", "owner", ""]], "")).toEqual({ canView: false, canSend: false });
  });
});

describe("ComposeDigestButton", () => {
  beforeEach(() => {
    flags.newsletter = true;
    loggedIn("alice");
  });

  it("shows for a Pro creator on their own surface and for a community sender; not for a non-Pro creator, a non-sender, or with the feature off", () => {
    const client = createTestQueryClient();
    client.setQueryData(["accounts", "pro-members"], { members: ["alice"] });
    const { unmount: u1 } = render(<ComposeDigestButton target={target} isSender />, client);
    expect(screen.getByText("newsletter.compose-button")).toBeInTheDocument();
    u1();
    const { unmount: u2 } = render(<ComposeDigestButton target={{ type: "community", target: "hive-125125", label: "Town Square" }} isSender />, client);
    expect(screen.getByText("newsletter.compose-button")).toBeInTheDocument();
    u2();
    client.setQueryData(["accounts", "pro-members"], { members: ["someone-else"] });
    const { container: c1, unmount: u3 } = render(<ComposeDigestButton target={target} isSender />, client);
    expect(c1.textContent).toBe("");
    u3();
    client.setQueryData(["accounts", "pro-members"], { members: ["alice"] });
    const { container: c2, unmount: u4 } = render(<ComposeDigestButton target={target} isSender={false} />, client);
    expect(c2.textContent).toBe("");
    u4();
    flags.newsletter = false;
    const { container: c3 } = render(<ComposeDigestButton target={target} isSender />, client);
    expect(c3.textContent).toBe("");
  });
});

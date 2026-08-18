import "@testing-library/jest-dom";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { digestSubscriptionsKey, FirstPublishDigestPrompt } from "@/features/newsletter";
import {
  cleanupModalContainers,
  createTestQueryClient,
  mockActiveUser,
  mockFullAccount,
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
const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);

function signedIn(postCount: number) {
  vi.mocked(useActiveAccount).mockReturnValue({
    activeUser: mockActiveUser({ username: "newbie" }),
    username: "newbie",
    account: mockFullAccount({ name: "newbie", post_count: postCount }),
    isLoading: false,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isSuccess: true
  } as never);
}

describe("FirstPublishDigestPrompt", () => {
  beforeEach(() => {
    setupModalContainers();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string) =>
      url === "/api/newsletter/subscriptions" ? ok({ subscriptions: [] }) : ok({ status: "pending_confirmation" })
    );
    window.localStorage.clear();
    flags.newsletter = true;
    signedIn(1);
  });
  afterEach(() => {
    cleanupModalContainers();
    vi.unstubAllGlobals();
  });

  it("offers the digest once after the first publish, with no pre-selection", async () => {
    renderWithQueryClient(<FirstPublishDigestPrompt />);
    expect(await screen.findByText("newsletter.prompt-title")).toBeInTheDocument();
    // Two explicit actions, neither pre-selected; nothing has been sent.
    expect(screen.getByRole("button", { name: "newsletter.prompt-accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "newsletter.prompt-dismiss" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter((c) => c[0] === "/api/newsletter/subscribe")).toHaveLength(0);
  });

  it("is not offered when the account has published before, already has a digest, has answered, or the feature is off", async () => {
    signedIn(7);
    const { container: veteran, unmount: u1 } = renderWithQueryClient(<FirstPublishDigestPrompt />);
    await new Promise((r) => setTimeout(r, 30));
    expect(veteran).toBeEmptyDOMElement();
    u1();

    signedIn(1);
    const client = createTestQueryClient();
    client.setQueryData(digestSubscriptionsKey("newbie"), [{ id: "x", email: "n@example.com", account: "newbie", type: "own", target: "newbie", cadence: "weekly", status: "active", created_at: "" }]);
    const { container: subscribed, unmount: u2 } = renderWithQueryClient(<FirstPublishDigestPrompt />, { queryClient: client });
    await new Promise((r) => setTimeout(r, 30));
    expect(subscribed).toBeEmptyDOMElement();
    u2();

    window.localStorage.setItem("ecency:digest-prompt:newbie", "dismissed:2026-08-18T00:00:00Z");
    const { container: answered, unmount: u3 } = renderWithQueryClient(<FirstPublishDigestPrompt />);
    await new Promise((r) => setTimeout(r, 30));
    expect(answered).toBeEmptyDOMElement();
    u3();
    window.localStorage.clear();

    flags.newsletter = false;
    const { container: off } = renderWithQueryClient(<FirstPublishDigestPrompt />);
    await new Promise((r) => setTimeout(r, 30));
    expect(off).toBeEmptyDOMElement();
  });

  it("dismissing records the answer so it never re-prompts", async () => {
    renderWithQueryClient(<FirstPublishDigestPrompt />);
    fireEvent.click(await screen.findByRole("button", { name: "newsletter.prompt-dismiss" }));
    await waitFor(() => expect(screen.queryByText("newsletter.prompt-title")).not.toBeInTheDocument());
    expect(window.localStorage.getItem("ecency:digest-prompt:newbie")).toMatch(/^dismissed:/);
    // A second render on the same device is silent.
    const { container } = renderWithQueryClient(<FirstPublishDigestPrompt />);
    await new Promise((r) => setTimeout(r, 30));
    expect(container).toBeEmptyDOMElement();
  });

  it("accepting opens the own-digest dialog, which asks for the address and subscribes with type own", async () => {
    renderWithQueryClient(<FirstPublishDigestPrompt />);
    fireEvent.click(await screen.findByRole("button", { name: "newsletter.prompt-accept" }));
    expect(await screen.findByText("newsletter.own-digest")).toBeInTheDocument();
    // No address held for the account yet: the dialog asks for one.
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "newbie@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "newsletter.subscribe" }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[0] === "/api/newsletter/subscribe");
      expect(call).toBeTruthy();
      expect(JSON.parse(call![1].body)).toMatchObject({
        email: "newbie@example.com",
        type: "own",
        target: "newbie",
        cadence: "weekly",
        source: "publish-prompt",
        code: "mock-token"
      });
    });
    expect(await screen.findByText("newsletter.check-inbox")).toBeInTheDocument();
  });
});

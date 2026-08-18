import "@testing-library/jest-dom";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewsletterRuntimeProvider } from "@/features/newsletter/runtime";
import type { ReactElement } from "react";
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

function signedIn() {
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
}


/** Renders inside a "service configured" runtime, as app/providers.tsx does on a configured deploy. */
function renderConfigured(ui: ReactElement, options?: Parameters<typeof renderWithQueryClient>[1]) {
  return renderWithQueryClient(<NewsletterRuntimeProvider configured>{ui}</NewsletterRuntimeProvider>, options);
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
    signedIn();
  });
  afterEach(() => {
    cleanupModalContainers();
    vi.unstubAllGlobals();
  });

  it("offers the digest once after the first publish, with no pre-selection", async () => {
    renderConfigured(<FirstPublishDigestPrompt />);
    expect(await screen.findByText("newsletter.prompt-title")).toBeInTheDocument();
    // Two explicit actions, neither pre-selected; nothing has been sent.
    expect(screen.getByRole("button", { name: "newsletter.prompt-accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "newsletter.prompt-dismiss" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter((c) => c[0] === "/api/newsletter/subscribe")).toHaveLength(0);
  });

  it("is not offered when the subscriptions failed to load, the account already has a digest, has answered, or the feature is off", async () => {
    // A failed load: "no digest yet" cannot be established, so nothing is offered.
    fetchMock.mockImplementation((url: string) =>
      url === "/api/newsletter/subscriptions" ? Promise.resolve({ ok: false, status: 503, json: async () => ({ error: "down" }) } as Response) : ok({})
    );
    const { container: failed, unmount: u1 } = renderConfigured(<FirstPublishDigestPrompt />);
    await new Promise((r) => setTimeout(r, 60));
    expect(failed).toBeEmptyDOMElement();
    u1();
    fetchMock.mockImplementation((url: string) =>
      url === "/api/newsletter/subscriptions" ? ok({ subscriptions: [] }) : ok({ status: "pending_confirmation" })
    );

    const client = createTestQueryClient();
    client.setQueryData(digestSubscriptionsKey("newbie"), [{ id: "x", email: "n@example.com", account: "newbie", type: "own", target: "newbie", cadence: "weekly", status: "active", created_at: "" }]);
    const { container: subscribed, unmount: u2 } = renderConfigured(<FirstPublishDigestPrompt />, { queryClient: client });
    await new Promise((r) => setTimeout(r, 30));
    expect(subscribed).toBeEmptyDOMElement();
    u2();

    window.localStorage.setItem("ecency:digest-prompt:newbie", "dismissed:2026-08-18T00:00:00Z");
    const { container: answered, unmount: u3 } = renderConfigured(<FirstPublishDigestPrompt />);
    await new Promise((r) => setTimeout(r, 30));
    expect(answered).toBeEmptyDOMElement();
    u3();
    window.localStorage.clear();

    flags.newsletter = false;
    const { container: off } = renderConfigured(<FirstPublishDigestPrompt />);
    await new Promise((r) => setTimeout(r, 30));
    expect(off).toBeEmptyDOMElement();
  });

  it("dismissing records the answer so it never re-prompts", async () => {
    renderConfigured(<FirstPublishDigestPrompt />);
    fireEvent.click(await screen.findByRole("button", { name: "newsletter.prompt-dismiss" }));
    await waitFor(() => expect(screen.queryByText("newsletter.prompt-title")).not.toBeInTheDocument());
    expect(window.localStorage.getItem("ecency:digest-prompt:newbie")).toMatch(/^dismissed:/);
    // A second render on the same device is silent.
    const { container } = renderConfigured(<FirstPublishDigestPrompt />);
    await new Promise((r) => setTimeout(r, 30));
    expect(container).toBeEmptyDOMElement();
  });

  it("accepting opens the own-digest dialog, which asks for the address and subscribes with type own", async () => {
    renderConfigured(<FirstPublishDigestPrompt />);
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

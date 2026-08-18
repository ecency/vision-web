import "@testing-library/jest-dom";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { DigestSubscribeButton, DigestSubscribeDialog, digestSubscriptionsKey } from "@/features/newsletter";
import {
  cleanupModalContainers,
  createTestQueryClient,
  mockActiveUser,
  renderWithQueryClient,
  setupModalContainers
} from "@/specs/test-utils";

const flags = vi.hoisted(() => ({ newsletter: true }));
vi.mock("@/config", () => ({
  EcencyConfigManager: {
    getConfigValue: (fn: (c: unknown) => unknown) => fn({ visionFeatures: { newsletter: { enabled: flags.newsletter } } })
  }
}));

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
}

const SUB = {
  id: "6f1c2c1a-2b3c-4d5e-8f90-123456789abc",
  email: "alice@example.com",
  account: "alice",
  type: "community",
  target: "hive-140217",
  cadence: "weekly",
  status: "active",
  created_at: "2026-08-17T00:00:00Z"
};

const dialogProps = {
  type: "community" as const,
  target: "hive-140217",
  targetLabel: "Hive Gaming",
  source: "community-page" as const,
  show: true,
  onHide: vi.fn()
};

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

describe("DigestSubscribeDialog", () => {
  beforeEach(() => {
    setupModalContainers();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    flags.newsletter = true;
    loggedIn(null);
  });
  afterEach(() => {
    cleanupModalContainers();
    vi.unstubAllGlobals();
  });

  it("anonymous: asks for an address, subscribes without a token, and shows the confirmation prompt", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/newsletter/subscribe" && init?.method === "POST") {
        // What the service returns to an unproven caller: this and nothing more.
        return jsonResponse(200, { status: "pending_confirmation" });
      }
      return jsonResponse(404, {});
    });
    renderWithQueryClient(<DigestSubscribeDialog {...dialogProps} />);

    const email = screen.getByPlaceholderText("you@example.com");
    const subscribeBtn = screen.getByRole("button", { name: "newsletter.subscribe" });
    expect(subscribeBtn).toBeDisabled(); // no address yet
    fireEvent.change(email, { target: { value: "reader@example.com" } });
    expect(subscribeBtn).not.toBeDisabled();
    fireEvent.click(subscribeBtn);

    await waitFor(() => expect(screen.getByText("newsletter.check-inbox")).toBeInTheDocument());
    const call = fetchMock.mock.calls.find((c) => c[0] === "/api/newsletter/subscribe");
    const body = JSON.parse(call![1].body);
    expect(body).toMatchObject({
      email: "reader@example.com",
      type: "community",
      target: "hive-140217",
      cadence: "weekly",
      source: "community-page"
    });
    expect(body.code).toBeUndefined();
    // Nothing that a logged-in flow would offer.
    expect(screen.queryByText("newsletter.manage-all")).not.toBeInTheDocument();
  });

  it("logged in and subscribed: shows the state, updates cadence in place, and can leave", async () => {
    loggedIn("alice");
    const client = createTestQueryClient();
    client.setQueryData(digestSubscriptionsKey("alice"), [SUB]);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/newsletter/subscribe") {
        return jsonResponse(200, { status: "active", created: false, subscription: { ...SUB, cadence: "monthly" } });
      }
      if (url.startsWith("/api/newsletter/subscriptions/") && init?.method === "DELETE") {
        return jsonResponse(200, { left: true });
      }
      if (url === "/api/newsletter/subscriptions") return jsonResponse(200, { subscriptions: [SUB] });
      return jsonResponse(404, {});
    });
    renderWithQueryClient(<DigestSubscribeDialog {...dialogProps} />, { queryClient: client });

    expect(screen.getByText("newsletter.status-active")).toBeInTheDocument();
    // The address is already known: no email field, and Update is inert until something changes.
    expect(screen.queryByPlaceholderText("you@example.com")).not.toBeInTheDocument();
    const update = screen.getByRole("button", { name: "newsletter.update" });
    expect(update).toBeDisabled();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "monthly" } });
    expect(update).not.toBeDisabled();
    fireEvent.click(update);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[0] === "/api/newsletter/subscribe");
      expect(call).toBeTruthy();
      const body = JSON.parse(call![1].body);
      expect(body).toMatchObject({ email: "alice@example.com", cadence: "monthly" });
      expect(body.code).toBe("mock-token");
    });

    fireEvent.click(screen.getByRole("button", { name: "newsletter.leave" }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[1]?.method === "DELETE");
      expect(call?.[0]).toBe(`/api/newsletter/subscriptions/${SUB.id}`);
    });
    await waitFor(() => expect(dialogProps.onHide).toHaveBeenCalled());
    expect(client.getQueryData(digestSubscriptionsKey("alice"))).toEqual([]);
  });

  it("shows the refusal copy when the service refuses a suppressed address", async () => {
    fetchMock.mockImplementation(() => jsonResponse(200, { status: "refused", reason: "suppressed" }));
    renderWithQueryClient(<DigestSubscribeDialog {...dialogProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "gone@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "newsletter.subscribe" }));
    await waitFor(() => expect(screen.getByText("newsletter.refused-anon")).toBeInTheDocument());
  });
});

describe("DigestSubscribeButton", () => {
  beforeEach(() => {
    setupModalContainers();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => jsonResponse(404, {}));
    flags.newsletter = true;
    loggedIn(null);
  });
  afterEach(() => {
    cleanupModalContainers();
    vi.unstubAllGlobals();
  });

  it("renders nothing when the feature is off", () => {
    flags.newsletter = false;
    const { container } = renderWithQueryClient(
      <DigestSubscribeButton type="community" target="hive-1" targetLabel="X" source="community-page" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers a creator digest only for an Ecency Pro creator", () => {
    const client = createTestQueryClient();
    client.setQueryData(["accounts", "pro-members"], { members: ["good-karma"] });
    const { container: notPro } = renderWithQueryClient(
      <DigestSubscribeButton type="creator" target="someone" targetLabel="Someone" source="creator-page" />,
      { queryClient: client }
    );
    expect(notPro).toBeEmptyDOMElement();
    renderWithQueryClient(
      <DigestSubscribeButton type="creator" target="good-karma" targetLabel="Good Karma" source="creator-page" />,
      { queryClient: client }
    );
    expect(screen.getByRole("button", { name: /newsletter\.button/ })).toBeInTheDocument();
  });

  it("reflects the logged-in account's subscription and opens the dialog", async () => {
    loggedIn("alice");
    const client = createTestQueryClient();
    client.setQueryData(digestSubscriptionsKey("alice"), [SUB]);
    renderWithQueryClient(
      <DigestSubscribeButton type="community" target="hive-140217" targetLabel="Hive Gaming" source="community-page" />,
      { queryClient: client }
    );
    const btn = screen.getByRole("button", { name: /newsletter\.button-subscribed/ });
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByText("newsletter.status-active")).toBeInTheDocument());
    const dialog = document.querySelector("#modal-dialog-container") as HTMLElement;
    expect(within(dialog).getByRole("button", { name: "newsletter.leave" })).toBeInTheDocument();
  });
});

import "@testing-library/jest-dom";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewsletterRuntimeProvider } from "@/features/newsletter/runtime";
import type { ReactElement } from "react";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import {
  NewsletterApiError,
  getDigestSubscriptionsRequest,
  leaveDigestRequest,
  subscribeDigestRequest
} from "@ecency/sdk";
import { DigestSubscribeButton, DigestSubscribeDialog, digestSubscriptionsKey } from "@/features/newsletter";
import {
  cleanupModalContainers,
  createTestQueryClient,
  mockActiveUser,
  renderWithQueryClient,
  setupModalContainers
} from "@/specs/test-utils";

/**
 * The Turnstile widget, mocked: the real one appends a Cloudflare <script> jsdom never
 * runs, so an anonymous subscribe would sit behind a token that can never arrive. It
 * renders nothing and hands the test the callbacks.
 */
const captcha = vi.hoisted(() => ({
  verify: null as null | ((token: string) => void),
  resets: 0
}));
vi.mock("@/features/shared/turnstile", () => ({
  TURNSTILE_SITEKEY: "test-sitekey",
  Turnstile: ({
    onVerify,
    ref
  }: {
    onVerify: (token: string) => void;
    ref?: { current: { reset: () => void } | null };
  }) => {
    captcha.verify = onVerify;
    if (ref) ref.current = { reset: () => { captcha.resets += 1; } };
    return null;
  }
}));

const CAPTCHA_TOKEN = "turnstile-test-token";

async function solveCaptcha() {
  await act(async () => {
    captcha.verify?.(CAPTCHA_TOKEN);
  });
}

const flags = vi.hoisted(() => ({ newsletter: true }));
vi.mock("@/config", () => ({
  EcencyConfigManager: {
    getConfigValue: (fn: (c: unknown) => unknown) => fn({ visionFeatures: { newsletter: { enabled: flags.newsletter } } })
  }
}));

// The api layer awaits ensureValidToken(); the global @/utils mock only stubs
// getAccessToken, so provide the awaited variant here.
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<object>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token"),
  ensureValidToken: vi.fn(async () => "mock-token")
}));

// Transport (paths, bodies, auth placement) is pinned by the SDK's own
// api.spec.ts; this file pins the dialog: what it asks of the SDK client and
// how it renders each outcome.
const subscribeMock = vi.mocked(subscribeDigestRequest);
const listMock = vi.mocked(getDigestSubscriptionsRequest);
const leaveMock = vi.mocked(leaveDigestRequest);

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


/** Renders inside a "service configured" runtime, as app/providers.tsx does on a configured deploy. */
function renderConfigured(ui: ReactElement, options?: Parameters<typeof renderWithQueryClient>[1]) {
  return renderWithQueryClient(<NewsletterRuntimeProvider configured>{ui}</NewsletterRuntimeProvider>, options);
}

describe("DigestSubscribeDialog", () => {
  beforeEach(() => {
    setupModalContainers();
    subscribeMock.mockReset();
    leaveMock.mockReset();
    listMock.mockReset();
    listMock.mockResolvedValue([]);
    flags.newsletter = true;
    loggedIn(null);
  });
  afterEach(() => {
    cleanupModalContainers();
    captcha.verify = null;
    captcha.resets = 0;
  });

  it("anonymous: asks for an address, clears a bot check, subscribes without an account token, and shows the confirmation prompt", async () => {
    // What the service returns to an unproven caller: this and nothing more.
    subscribeMock.mockResolvedValue({ status: "pending_confirmation" } as never);
    renderConfigured(<DigestSubscribeDialog {...dialogProps} />);

    const email = screen.getByPlaceholderText("you@example.com");
    const subscribeBtn = screen.getByRole("button", { name: "newsletter.subscribe" });
    expect(subscribeBtn).toBeDisabled(); // no address yet
    fireEvent.change(email, { target: { value: "reader@example.com" } });
    // An address is no longer enough: an anonymous caller also clears the bot check,
    // because this request makes us mail an address nobody has proven they own.
    expect(subscribeBtn).toBeDisabled();
    await solveCaptcha();
    expect(subscribeBtn).not.toBeDisabled();
    fireEvent.click(subscribeBtn);

    await waitFor(() => expect(screen.getByText("newsletter.check-inbox")).toBeInTheDocument());
    const [input, code] = subscribeMock.mock.calls[0];
    expect(input).toMatchObject({
      email: "reader@example.com",
      type: "community",
      target: "hive-140217",
      cadence: "weekly",
      source: "community-page",
      captchaToken: CAPTCHA_TOKEN
    });
    // Anonymous: no token argument reaches the SDK client.
    expect(code).toBeUndefined();
    // The display label is the dialog's own copy; it is not sent, so a caller cannot
    // write part of a sentence into mail our domain sends.
    expect(input).not.toHaveProperty("targetLabel");
    // Nothing that a logged-in flow would offer.
    expect(screen.queryByText("newsletter.manage-all")).not.toBeInTheDocument();
  });

  it("logged in and subscribed: shows the state, updates cadence in place, and can leave", async () => {
    loggedIn("alice");
    const client = createTestQueryClient();
    client.setQueryData(digestSubscriptionsKey("alice"), [SUB]);
    subscribeMock.mockResolvedValue({ status: "active", created: false, subscription: { ...SUB, cadence: "monthly" } } as never);
    leaveMock.mockResolvedValue(undefined as never);
    listMock.mockResolvedValue([SUB] as never);
    renderConfigured(<DigestSubscribeDialog {...dialogProps} />, { queryClient: client });

    expect(screen.getByText("newsletter.status-active")).toBeInTheDocument();
    // The address is already known: no email field, and Update is inert until something changes.
    expect(screen.queryByPlaceholderText("you@example.com")).not.toBeInTheDocument();
    const update = screen.getByRole("button", { name: "newsletter.update" });
    expect(update).toBeDisabled();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "monthly" } });
    expect(update).not.toBeDisabled();
    fireEvent.click(update);
    await waitFor(() => {
      expect(subscribeMock).toHaveBeenCalledWith(
        expect.objectContaining({ email: "alice@example.com", cadence: "monthly" }),
        "mock-token"
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "newsletter.leave" }));
    await waitFor(() => {
      expect(leaveMock).toHaveBeenCalledWith(SUB.id, "mock-token");
    });
    await waitFor(() => expect(dialogProps.onHide).toHaveBeenCalled());
    expect(client.getQueryData(digestSubscriptionsKey("alice"))).toEqual([]);
  });

  it("a refusal is not a dead end: the copy is shown and the form can be tried again", async () => {
    subscribeMock.mockResolvedValue({ status: "refused", reason: "suppressed" } as never);
    renderConfigured(<DigestSubscribeDialog {...dialogProps} />);
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "gone@example.com" } });
    await solveCaptcha();
    fireEvent.click(screen.getByRole("button", { name: "newsletter.subscribe" }));
    await waitFor(() => expect(screen.getByText("newsletter.refused")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "newsletter.try-again" }));
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(screen.queryByText("newsletter.refused")).not.toBeInTheDocument();
    // The first attempt spent the token, so the way back re-challenges rather than
    // letting the retry post a used one and fail with a generic error.
    expect(captcha.resets).toBe(1);
    expect(screen.getByRole("button", { name: "newsletter.subscribe" })).toBeDisabled();
  });

  it("reveals the challenge to a signed-in caller whose token could not be refreshed", async () => {
    // Being signed in locally is not the same as holding a usable token: ensureValidToken
    // returns undefined when the refresh fails, subscribe() then omits `code`, and the
    // route sees an anonymous request and 403s. Without this the dialog would show no
    // challenge and the person could never satisfy the one the server is asking for.
    loggedIn("alice");
    const client = createTestQueryClient();
    client.setQueryData(digestSubscriptionsKey("alice"), []);
    subscribeMock.mockRejectedValue(new NewsletterApiError("Security check failed", 403));
    renderConfigured(<DigestSubscribeDialog {...dialogProps} />, { queryClient: client });

    // Signed in, so no widget yet.
    expect(captcha.verify).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "a@e.com" } });
    fireEvent.click(screen.getByRole("button", { name: "newsletter.subscribe" }));

    // The 403 is the server saying it wanted a token, so the challenge appears.
    await waitFor(() => expect(captcha.verify).not.toBeNull());
    expect(screen.getByRole("button", { name: "newsletter.subscribe" })).toBeDisabled();
    await solveCaptcha();
    expect(screen.getByRole("button", { name: "newsletter.subscribe" })).not.toBeDisabled();
  });

  it("a pending subscription offers to resend the confirmation at the same cadence", async () => {
    loggedIn("alice");
    const client = createTestQueryClient();
    client.setQueryData(digestSubscriptionsKey("alice"), [{ ...SUB, status: "pending_confirmation" }]);
    subscribeMock.mockResolvedValue({ status: "pending_confirmation" } as never);
    renderConfigured(<DigestSubscribeDialog {...dialogProps} />, { queryClient: client });
    // Same cadence, pending: the primary action is "resend", and it is enabled.
    const resend = screen.getByRole("button", { name: "newsletter.resend" });
    expect(resend).not.toBeDisabled();
    fireEvent.click(resend);
    await waitFor(() => {
      expect(subscribeMock).toHaveBeenCalledWith(
        expect.objectContaining({ email: "alice@example.com", cadence: "weekly" }),
        "mock-token"
      );
    });
  });

  it("the check-your-inbox outcome survives a background refetch of the subscriptions", async () => {
    loggedIn("alice");
    const client = createTestQueryClient();
    let subscribed = false;
    subscribeMock.mockImplementation(async () => {
      subscribed = true;
      return { status: "pending_confirmation" } as never;
    });
    // Empty until the subscribe happened, then the refetch brings the pending row.
    listMock.mockImplementation(async () => (subscribed ? [{ ...SUB, status: "pending_confirmation" }] : []) as never);
    renderConfigured(<DigestSubscribeDialog {...dialogProps} />, { queryClient: client });
    fireEvent.change(await screen.findByPlaceholderText("you@example.com"), { target: { value: "alice@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "newsletter.subscribe" }));
    await waitFor(() => expect(screen.getByText("newsletter.check-inbox")).toBeInTheDocument());
    // The mutation invalidated the list; once the refetch has brought the pending
    // row in, the outcome must still be shown rather than reset away.
    await waitFor(() => expect(client.getQueryData(digestSubscriptionsKey("alice"))).toHaveLength(1));
    expect(screen.getByText("newsletter.check-inbox")).toBeInTheDocument();
  });
});

describe("DigestSubscribeButton", () => {
  beforeEach(() => {
    setupModalContainers();
    subscribeMock.mockReset();
    listMock.mockReset();
    listMock.mockResolvedValue([]);
    flags.newsletter = true;
    loggedIn(null);
  });
  afterEach(() => {
    cleanupModalContainers();
  });

  it("renders nothing when the feature is off, and asks the service for nothing", async () => {
    flags.newsletter = false;
    loggedIn("alice"); // a signed-in user would otherwise trigger the subscriptions query
    const { container } = renderConfigured(
      <DigestSubscribeButton type="community" target="hive-1" targetLabel="X" source="community-page" />
    );
    expect(container).toBeEmptyDOMElement();
    await new Promise((r) => setTimeout(r, 30));
    expect(listMock).not.toHaveBeenCalled();
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it("offers a creator digest for every creator: no Pro roster involved (2026-08-19)", () => {
    const client = createTestQueryClient();
    renderConfigured(
      <DigestSubscribeButton type="creator" target="someone" targetLabel="Someone" source="creator-page" />,
      { queryClient: client }
    );
    expect(screen.getByRole("button", { name: /newsletter\.button/ })).toBeInTheDocument();
    expect(client.getQueryData(["accounts", "pro-members"])).toBeUndefined();
  });

  it("reflects the logged-in account's subscription and opens the dialog", async () => {
    loggedIn("alice");
    const client = createTestQueryClient();
    client.setQueryData(digestSubscriptionsKey("alice"), [SUB]);
    renderConfigured(
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

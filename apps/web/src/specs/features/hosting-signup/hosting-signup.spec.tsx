import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithQueryClient } from "@/specs/test-utils";

// One-click HBD pay: clicking "Pay with Hive" must broadcast the EXACT payment instructions
// (to / amount / memo) through the user's transfer mutation, then poll the tenant and advance to
// success once it is active. i18next is globally mocked to echo keys, so we match on key strings.

// Hoisted so the vi.mock factories (which run before top-level consts initialize) can reference them.
const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  authLoginType: "keychain" as string,
  accessToken: undefined as string | undefined,
  profiles: {} as Record<string, any>,
  hostingApi: {
    paymentMethods: vi.fn(),
    templates: vi.fn(),
    createTenant: vi.fn(),
    paymentInstructions: vi.fn(),
    tenant: vi.fn(),
    tenantsByOwner: vi.fn(),
    mintHandoff: vi.fn()
  }
}));
const { mutateAsync, hostingApi } = mocks;

vi.mock("@/api/sdk-mutations", () => ({
  useTransferMutation: () => ({ mutateAsync: mocks.mutateAsync })
}));

vi.mock("@/features/hosting-signup/hosting-api", async () => {
  const actual = await vi.importActual<any>("@/features/hosting-signup/hosting-api");
  return { ...actual, hostingApi: mocks.hostingApi };
});

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: { username: "alice" } })
}));

// getLoginType drives whether the in-page one-click button is offered: Keychain-family extensions
// sign in-page, while HiveSigner/keychain-mobile redirect and must fall back to manual.
vi.mock("@/utils/user-token", () => ({
  getLoginType: () => mocks.authLoginType,
  getAccessToken: () => mocks.accessToken,
  ensureValidToken: vi.fn(async () => mocks.accessToken)
}));

vi.mock("@/core/global-store", () => ({
  useGlobalStore: (selector: (s: any) => unknown) => selector({ toggleUiProp: vi.fn() })
}));

import { HostingSignup } from "@/features/hosting-signup/hosting-signup";
import { getAccountFullQueryOptions } from "@ecency/sdk";

const INSTRUCTIONS = { to: "ecency.hosting", amount: "2.000 HBD", memo: "blog:alice" };

describe("HostingSignup one-click HBD pay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(null, "", "/"); // clear any ?resume= from a prior test
    mocks.authLoginType = "keychain";
    mocks.accessToken = "tok-alice";
    hostingApi.mintHandoff.mockResolvedValue({
      code: "hand-off-code-1234567890abcdef",
      username: "alice",
      expiresAt: new Date(Date.now() + 300000).toISOString()
    });
    // Card disabled so the payment step defaults to the HBD rail (where the one-click lives).
    hostingApi.paymentMethods.mockResolvedValue({
      hbd: { enabled: true, monthly: "2.000", account: "ecency.hosting" },
      x402: { enabled: false, monthly: "2.000" },
      card: { enabled: false, monthlyUsdCents: 200 }
    });
    hostingApi.createTenant.mockResolvedValue({
      tenant: {
        username: "alice",
        subscriptionStatus: "inactive",
        blogUrl: "https://alice.blogs.ecency.com"
      }
    });
    hostingApi.paymentInstructions.mockResolvedValue(INSTRUCTIONS);
    hostingApi.templates.mockResolvedValue({
      templates: [
        {
          id: "medium",
          name: "Medium",
          tagline: "Clean",
          isDefault: true,
          colors: { background: "#fff", surface: "#fafafa", accent: "#111", text: "#111" },
          headingStyle: "serif"
        },
        {
          id: "magazine",
          name: "Magazine",
          tagline: "Editorial",
          isDefault: false,
          colors: { background: "#faf8f5", surface: "#f5f2ed", accent: "#8b4513", text: "#2c2825" },
          headingStyle: "serif"
        }
      ]
    });
    // First activation: no baseline expiry, so "active" alone confirms.
    hostingApi.tenant.mockResolvedValue({
      username: "alice",
      owner: "alice",
      subscriptionStatus: "active",
      subscriptionExpiresAt: "2026-08-16T00:00:00.000Z"
    });
    mutateAsync.mockResolvedValue({ id: "tx1" });
  });

  it("resumes to payment from a ?resume= deep-link WITHOUT re-sending creation", async () => {
    hostingApi.tenantsByOwner.mockResolvedValue({
      tenants: [{ username: "alice", type: "blog", subscriptionStatus: "inactive", owner: "alice" }]
    });
    window.history.replaceState(null, "", "/hosting?resume=alice");
    renderWithQueryClient(<HostingSignup />);
    // Straight to the payment step: the reservation exists and its saved
    // customization must survive a resume click, so no createTenant is sent
    // (a re-create from this flow's empty customize state would refresh the
    // reservation with defaults). The resume param is consumed from the URL.
    await screen.findByRole("button", { name: "hosting.pay-hbd-oneclick" });
    expect(hostingApi.createTenant).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it("ignores a ?resume= for a name the user does not own (no reservation created)", async () => {
    hostingApi.tenantsByOwner.mockResolvedValue({ tenants: [] }); // alice owns nothing matching
    window.history.replaceState(null, "", "/hosting?resume=victim");
    renderWithQueryClient(<HostingSignup />);
    // Give the async owned-tenants check time to resolve, then assert no tenant was created and we
    // stayed on the first step.
    await waitFor(() => expect(hostingApi.tenantsByOwner).toHaveBeenCalled());
    expect(hostingApi.createTenant).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "hosting.pay-hbd-oneclick" })).toBeNull();
  });

  it("fetches custom-domain (:domain) HBD instructions when the add-on is toggled", async () => {
    renderWithQueryClient(<HostingSignup />);
    fireEvent.click(screen.getByText("g.continue"));
    fireEvent.click(await screen.findByText("g.continue"));
    // Standard HBD instructions are fetched first (domain = false).
    await waitFor(() =>
      expect(hostingApi.paymentInstructions).toHaveBeenCalledWith("alice", 1, false)
    );
    // Toggle the custom-domain add-on -> instructions are re-fetched with domain = true so the
    // memo/price reflect the one-step :domain tier on the HBD rail (no steer to card).
    fireEvent.click(await screen.findByText("hosting.custom-domain-option"));
    await waitFor(() =>
      expect(hostingApi.paymentInstructions).toHaveBeenCalledWith("alice", 1, true)
    );
  });

  it("broadcasts the exact transfer and advances to success", async () => {
    renderWithQueryClient(<HostingSignup />);

    // Username step (username pre-filled with the active account) -> configure -> payment.
    fireEvent.click(screen.getByText("g.continue"));
    fireEvent.click(await screen.findByText("g.continue")); // configure step's Continue

    // The one-click button appears once payment instructions load and enable it.
    const payBtn = (await screen.findByRole("button", {
      name: "hosting.pay-hbd-oneclick"
    })) as HTMLButtonElement;
    await waitFor(() => expect(payBtn.disabled).toBe(false));

    fireEvent.click(payBtn);

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        to: INSTRUCTIONS.to,
        amount: INSTRUCTIONS.amount,
        memo: INSTRUCTIONS.memo
      })
    );
    // Poll saw an active tenant -> success screen (findByText throws if absent).
    await screen.findByText("hosting.success-title");

    // The primary action lands the owner on their site with setup pending and
    // the session carried as a FRAGMENT token, attached at CLICK time only: the
    // at-rest href must stay credential-free ("Copy link address" on the most
    // prominent button must never yield a bearer).
    const customize = screen.getByText("hosting.customize-your-blog") as HTMLAnchorElement;
    expect(customize.getAttribute("href")).toBe("https://alice.blogs.ecency.com/?setup=1");
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    // The minted code resolves asynchronously on success-screen mount, so
    // retry the click until the state lands. Only the one-time code travels
    // in the URL; the bearer stays out of it entirely.
    await waitFor(() => {
      fireEvent.click(customize);
      expect(open).toHaveBeenCalledWith(
        "https://alice.blogs.ecency.com/?setup=1#hc=hand-off-code-1234567890abcdef",
        "_blank",
        "noopener,noreferrer"
      );
    });
    expect(hostingApi.mintHandoff).toHaveBeenCalledWith("tok-alice");
    // The tokened URL replaced the default navigation; the clean href never
    // gained the fragment.
    expect(customize.getAttribute("href")).toBe("https://alice.blogs.ecency.com/?setup=1");
  });

  it("falls back to the credential-free href when minting fails", async () => {
    // The hosting API is down: no code means the default navigation, never a
    // bearer smuggled back into the URL as a substitute.
    hostingApi.mintHandoff.mockRejectedValue(new Error("api down"));
    hostingApi.tenantsByOwner.mockResolvedValue({ tenants: [] });
    renderWithQueryClient(<HostingSignup />);
    fireEvent.click(screen.getByText("g.continue"));
    fireEvent.click(await screen.findByText("g.continue"));
    const payBtn = (await screen.findByRole("button", {
      name: "hosting.pay-hbd-oneclick"
    })) as HTMLButtonElement;
    await waitFor(() => expect(payBtn.disabled).toBe(false));
    fireEvent.click(payBtn);
    await screen.findByText("hosting.success-title");
    await waitFor(() => expect(hostingApi.mintHandoff).toHaveBeenCalled());

    const customize = screen.getByText("hosting.customize-your-blog") as HTMLAnchorElement;
    expect(customize.getAttribute("href")).toBe("https://alice.blogs.ecency.com/?setup=1");
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    fireEvent.click(customize);
    expect(open).not.toHaveBeenCalled();
  });

  it("falls back to a plain setup intent when no access token is stored", async () => {
    mocks.accessToken = undefined;
    hostingApi.tenantsByOwner.mockResolvedValue({ tenants: [] });
    renderWithQueryClient(<HostingSignup />);
    fireEvent.click(screen.getByText("g.continue"));
    fireEvent.click(await screen.findByText("g.continue"));
    const payBtn = (await screen.findByRole("button", {
      name: "hosting.pay-hbd-oneclick"
    })) as HTMLButtonElement;
    await waitFor(() => expect(payBtn.disabled).toBe(false));
    fireEvent.click(payBtn);
    await screen.findByText("hosting.success-title");
    const customize = screen.getByText("hosting.customize-your-blog") as HTMLAnchorElement;
    expect(customize.getAttribute("href")).toBe("https://alice.blogs.ecency.com/?setup=1");
    // Without a token the click takes the default navigation (no window.open).
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    fireEvent.click(customize);
    expect(open).not.toHaveBeenCalled();
  });

  it("offers the instance-side OAuth fallback for Hivesigner sessions", async () => {
    // A hivesigner login's at-rest href carries the login hint (safe, not a
    // credential), so a middle-click or a failed token read still lands the
    // owner in a login flow instead of stranding them logged out. Hivesigner
    // logins have no one-click pay button, so the flow is driven as keychain
    // and the login type flips before the success render computes the href.
    mocks.accessToken = undefined;
    hostingApi.tenantsByOwner.mockResolvedValue({ tenants: [] });
    renderWithQueryClient(<HostingSignup />);
    fireEvent.click(screen.getByText("g.continue"));
    fireEvent.click(await screen.findByText("g.continue"));
    const payBtn = (await screen.findByRole("button", {
      name: "hosting.pay-hbd-oneclick"
    })) as HTMLButtonElement;
    await waitFor(() => expect(payBtn.disabled).toBe(false));
    fireEvent.click(payBtn);
    mocks.authLoginType = "hivesigner";
    await screen.findByText("hosting.success-title");
    const customize = screen.getByText("hosting.customize-your-blog") as HTMLAnchorElement;
    expect(customize.getAttribute("href")).toBe(
      "https://alice.blogs.ecency.com/?setup=1&login=hivesigner"
    );
  });

  it("does not broadcast until the user clicks pay (no accidental transfer)", async () => {
    renderWithQueryClient(<HostingSignup />);
    fireEvent.click(screen.getByText("g.continue"));
    fireEvent.click(await screen.findByText("g.continue"));
    await screen.findByText("hosting.pay-hbd-oneclick");
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("resumes a pending payment left by a redirect and shows success once active", async () => {
    // A redirecting signer (or reload) left a marker; on mount we poll and confirm activation.
    sessionStorage.setItem(
      "ecency:hosting:pending-hbd",
      JSON.stringify({ tenant: "alice", blogUrl: "https://alice.blogs.ecency.com", baseline: null })
    );
    renderWithQueryClient(<HostingSignup />);
    await screen.findByText("hosting.success-title");
    // Marker is cleared after a successful resume.
    expect(sessionStorage.getItem("ecency:hosting:pending-hbd")).toBeNull();
  });

  it("locks the one-click button after a broadcast whose activation times out (no duplicate send)", async () => {
    hostingApi.tenant.mockResolvedValue({
      username: "alice",
      owner: "alice",
      subscriptionStatus: "inactive",
      subscriptionExpiresAt: null
    });
    renderWithQueryClient(<HostingSignup />);
    fireEvent.click(screen.getByText("g.continue"));
    fireEvent.click(await screen.findByText("g.continue"));
    const payBtn = (await screen.findByRole("button", {
      name: "hosting.pay-hbd-oneclick"
    })) as HTMLButtonElement;
    await waitFor(() => expect(payBtn.disabled).toBe(false));

    vi.useFakeTimers();
    fireEvent.click(payBtn);
    // Broadcast resolves, then pollActivation loops 15×3s and times out.
    await vi.advanceTimersByTimeAsync(15 * 3000 + 200);
    vi.useRealTimers();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    // paying stays true -> button remains disabled so the same transfer can't be sent again.
    expect(payBtn.disabled).toBe(true);
  });

  it("falls back to manual (no one-click) for a redirecting login like HiveSigner", async () => {
    mocks.authLoginType = "hivesigner";
    renderWithQueryClient(<HostingSignup />);
    fireEvent.click(screen.getByText("g.continue"));
    fireEvent.click(await screen.findByText("g.continue"));
    // Manual path is shown; the in-page one-click button is not offered (it would be abandoned by
    // the HiveSigner page redirect mid-transfer).
    await screen.findByText("hosting.ive-paid");
    expect(screen.queryByText("hosting.pay-hbd-oneclick")).toBeNull();
  });
});

describe("HostingSignup customize step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(null, "", "/");
    mocks.authLoginType = "keychain";
    hostingApi.paymentMethods.mockResolvedValue({
      hbd: { enabled: true, monthly: "2.000", account: "ecency.hosting" },
      x402: { enabled: false, monthly: "2.000" },
      card: { enabled: false, monthlyUsdCents: 200 }
    });
    hostingApi.templates.mockResolvedValue({
      templates: [
        {
          id: "medium",
          name: "Medium",
          tagline: "Clean",
          isDefault: true,
          colors: { background: "#fff", surface: "#fafafa", accent: "#111", text: "#111" },
          headingStyle: "serif"
        },
        {
          id: "magazine",
          name: "Magazine",
          tagline: "Editorial",
          isDefault: false,
          colors: { background: "#faf8f5", surface: "#f5f2ed", accent: "#8b4513", text: "#2c2825" },
          headingStyle: "serif"
        }
      ]
    });
    hostingApi.createTenant.mockResolvedValue({
      tenant: {
        username: "alice",
        subscriptionStatus: "inactive",
        blogUrl: "https://alice.blogs.ecency.com"
      }
    });
    hostingApi.paymentInstructions.mockResolvedValue(INSTRUCTIONS);
  });

  it("sends the chosen template and accent with tenant creation", async () => {
    renderWithQueryClient(<HostingSignup />);
    fireEvent.click(screen.getByText("g.continue"));

    // Pick the Magazine card once the catalog loads.
    fireEvent.click(await screen.findByRole("radio", { name: /Magazine/ }));
    // Pick an accent via the free field.
    fireEvent.change(screen.getByLabelText("hosting.accent-label"), {
      target: { value: "#ff6600" }
    });
    fireEvent.click(screen.getByText("g.continue"));

    await waitFor(() => expect(hostingApi.createTenant).toHaveBeenCalled());
    const config = hostingApi.createTenant.mock.calls[0][2];
    expect(config.styleTemplate).toBe("magazine");
    expect(config.accent).toBe("#ff6600");
  });

  it("skipping every choice produces a creation payload with no style overrides", async () => {
    renderWithQueryClient(<HostingSignup />);
    fireEvent.click(screen.getByText("g.continue"));
    await screen.findByRole("radio", { name: /Medium/ });
    fireEvent.click(screen.getByText("g.continue"));

    await waitFor(() => expect(hostingApi.createTenant).toHaveBeenCalled());
    const config = hostingApi.createTenant.mock.calls[0][2];
    expect(config.styleTemplate).toBeUndefined();
    expect(config.accent).toBeUndefined();
    expect(config.fontPreset).toBeUndefined();
  });

  it("an invalid accent blocks Continue until fixed or cleared", async () => {
    renderWithQueryClient(<HostingSignup />);
    fireEvent.click(screen.getByText("g.continue"));
    await screen.findByRole("radio", { name: /Medium/ });

    fireEvent.change(screen.getByLabelText("hosting.accent-label"), {
      target: { value: "not-a-color" }
    });
    expect(screen.getByText("hosting.accent-invalid")).toBeTruthy();
    fireEvent.click(screen.getByText("g.continue"));
    expect(hostingApi.createTenant).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("hosting.accent-label"), {
      target: { value: "#0af" }
    });
    fireEvent.click(screen.getByText("g.continue"));
    await waitFor(() => expect(hostingApi.createTenant).toHaveBeenCalled());
    expect(hostingApi.createTenant.mock.calls[0][2].accent).toBe("#0af");
  });

  it("keeps working as a plain form when the catalog cannot load", async () => {
    hostingApi.templates.mockRejectedValue(new Error("down"));
    renderWithQueryClient(<HostingSignup />);
    fireEvent.click(screen.getByText("g.continue"));

    await screen.findByText("hosting.template-load-failed");
    fireEvent.click(screen.getByText("g.continue"));
    await waitFor(() => expect(hostingApi.createTenant).toHaveBeenCalled());
    expect(hostingApi.createTenant.mock.calls[0][2].styleTemplate).toBeUndefined();
  });
});

describe("HostingSignup customize step: coverage the mutation review demanded", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(null, "", "/");
    mocks.authLoginType = "keychain";
    mocks.profiles = {};
    // The global SDK mock resolves account queries to undefined; the prefill tests need a
    // controllable profile per name.
    vi.mocked(getAccountFullQueryOptions as any).mockImplementation((username: string) => ({
      queryKey: ["spec-account", username],
      queryFn: async () => mocks.profiles[username] ?? null
    }));
    hostingApi.paymentMethods.mockResolvedValue({
      hbd: { enabled: true, monthly: "2.000", account: "ecency.hosting" },
      x402: { enabled: false, monthly: "2.000" },
      card: { enabled: false, monthlyUsdCents: 200 }
    });
    hostingApi.templates.mockResolvedValue({
      templates: [
        {
          id: "medium",
          name: "Medium",
          tagline: "Clean",
          isDefault: true,
          colors: { background: "#fff", surface: "#fafafa", accent: "#111", text: "#111" },
          headingStyle: "serif"
        },
        {
          id: "magazine",
          name: "Magazine",
          tagline: "Editorial",
          isDefault: false,
          colors: { background: "#faf8f5", surface: "#f5f2ed", accent: "#8b4513", text: "#2c2825" },
          headingStyle: "serif"
        }
      ]
    });
    hostingApi.createTenant.mockResolvedValue({
      tenant: {
        username: "alice",
        subscriptionStatus: "inactive",
        blogUrl: "https://alice.blogs.ecency.com"
      }
    });
    hostingApi.paymentInstructions.mockResolvedValue(INSTRUCTIONS);
    hostingApi.tenant.mockResolvedValue({
      username: "alice",
      owner: "alice",
      subscriptionStatus: "active",
      subscriptionExpiresAt: "2026-08-16T00:00:00.000Z"
    });
    mutateAsync.mockResolvedValue({ id: "tx1" });
  });

  it("a chosen font preset reaches the creation payload", async () => {
    renderWithQueryClient(<HostingSignup />);
    fireEvent.click(screen.getByText("g.continue"));
    await screen.findByRole("radio", { name: /Medium/ });

    fireEvent.change(screen.getByLabelText("hosting.fonts-label"), {
      target: { value: "technical" }
    });
    fireEvent.click(screen.getByText("g.continue"));

    await waitFor(() => expect(hostingApi.createTenant).toHaveBeenCalled());
    expect(hostingApi.createTenant.mock.calls[0][2].fontPreset).toBe("technical");
  });

  it("restores a saved draft for the name and clears it after success", async () => {
    localStorage.setItem(
      "ecency:hosting:customize:alice",
      JSON.stringify({ styleTemplate: "magazine", accent: "#0af", fontPreset: null })
    );
    renderWithQueryClient(<HostingSignup />);
    fireEvent.click(screen.getByText("g.continue"));
    await screen.findByRole("radio", { name: /Magazine/ });

    // The draft restored into the pickers and flows into the payload untouched.
    fireEvent.click(screen.getByText("g.continue"));
    await waitFor(() => expect(hostingApi.createTenant).toHaveBeenCalled());
    const config = hostingApi.createTenant.mock.calls[0][2];
    expect(config.styleTemplate).toBe("magazine");
    expect(config.accent).toBe("#0af");

    // Pay via one-click HBD and reach success: the draft has served its purpose.
    const payBtn = (await screen.findByRole("button", {
      name: "hosting.pay-hbd-oneclick"
    })) as HTMLButtonElement;
    await waitFor(() => expect(payBtn.disabled).toBe(false));
    fireEvent.click(payBtn);
    await screen.findByText("hosting.success-title");
    // The cleanup runs in an effect after the success commit; on a slow CI
    // runner the paint can beat the effect, so poll rather than read once.
    await waitFor(() =>
      expect(localStorage.getItem("ecency:hosting:customize:alice")).toBeNull()
    );
  });

  it("prefills empty identity from the profile and takes it back out on a name change", async () => {
    mocks.profiles.alice = { profile: { name: "Alice W", about: "Alice writes here" } };
    renderWithQueryClient(<HostingSignup />);
    fireEvent.click(screen.getByText("g.continue"));

    // Prefilled from alice's profile into the EMPTY fields.
    await waitFor(() =>
      expect(
        (screen.getByPlaceholderText("hosting.blog-title-placeholder") as HTMLInputElement).value
      ).toBe("Alice W")
    );

    // Change the name: the planted identity must not ride into bob's tenant.
    fireEvent.click(screen.getByText("g.back"));
    fireEvent.change(screen.getByPlaceholderText("yourname"), { target: { value: "bob" } });
    fireEvent.click(screen.getByText("g.continue"));
    await waitFor(() =>
      expect(
        (screen.getByPlaceholderText("hosting.blog-title-placeholder") as HTMLInputElement).value
      ).not.toBe("Alice W")
    );
    fireEvent.click(screen.getByText("g.continue"));
    await waitFor(() => expect(hostingApi.createTenant).toHaveBeenCalled());
    expect(hostingApi.createTenant.mock.calls[0][2].title).not.toBe("Alice W");
  });

  it("re-customizing after an abandoned reservation re-sends creation with the new look", async () => {
    // First visit: reserve with the default look, then abandon before paying (payment has
    // no back button, so the real re-entry path is a fresh page load with the draft).
    const first = renderWithQueryClient(<HostingSignup />);
    fireEvent.click(screen.getByText("g.continue"));
    await screen.findByRole("radio", { name: /Medium/ });
    fireEvent.click(screen.getByText("g.continue"));
    await waitFor(() => expect(hostingApi.createTenant).toHaveBeenCalledTimes(1));
    first.unmount();

    // Second visit: the draft restores the step; pick a different look and continue.
    renderWithQueryClient(<HostingSignup />);
    fireEvent.click(screen.getByText("g.continue"));
    fireEvent.click(await screen.findByRole("radio", { name: /Magazine/ }));
    fireEvent.click(screen.getByText("g.continue"));

    // The reservation is re-sent with the NEW config; the server refreshes the unpaid
    // reservation so the look on screen is the look that activates.
    await waitFor(() => expect(hostingApi.createTenant).toHaveBeenCalledTimes(2));
    expect(hostingApi.createTenant.mock.calls[1][2].styleTemplate).toBe("magazine");
  });
});

describe("HostingSignup reservation grace notice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(null, "", "/");
    mocks.authLoginType = "keychain";
    mocks.profiles = {};
    hostingApi.templates.mockResolvedValue({ templates: [] });
    hostingApi.createTenant.mockResolvedValue({
      tenant: {
        username: "alice",
        subscriptionStatus: "inactive",
        blogUrl: "https://alice.blogs.ecency.com"
      }
    });
    hostingApi.paymentInstructions.mockResolvedValue(INSTRUCTIONS);
  });

  it("states the window on the payment step for a fresh reservation", async () => {
    hostingApi.paymentMethods.mockResolvedValue({
      hbd: { enabled: true, monthly: "2.000", account: "ecency.hosting" },
      x402: { enabled: false, monthly: "2.000" },
      card: { enabled: false, monthlyUsdCents: 200 },
      reservation: { graceDays: 7 }
    });
    renderWithQueryClient(<HostingSignup />);
    fireEvent.click(screen.getByText("g.continue"));
    fireEvent.click(await screen.findByText("g.continue"));
    await screen.findByText("hosting.reservation-grace");
  });

  it("stays silent when the API does not report a window", async () => {
    hostingApi.paymentMethods.mockResolvedValue({
      hbd: { enabled: true, monthly: "2.000", account: "ecency.hosting" },
      x402: { enabled: false, monthly: "2.000" },
      card: { enabled: false, monthlyUsdCents: 200 }
    });
    renderWithQueryClient(<HostingSignup />);
    fireEvent.click(screen.getByText("g.continue"));
    fireEvent.click(await screen.findByText("g.continue"));
    await screen.findAllByText("hosting.term-months");
    expect(screen.queryByText("hosting.reservation-grace")).toBeNull();
  });
});

describe("HostingSignup reservation grace notice: renewals stay silent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(null, "", "/");
    mocks.authLoginType = "keychain";
    mocks.profiles = {};
    hostingApi.templates.mockResolvedValue({ templates: [] });
    hostingApi.paymentMethods.mockResolvedValue({
      hbd: { enabled: true, monthly: "2.000", account: "ecency.hosting" },
      x402: { enabled: false, monthly: "2.000" },
      card: { enabled: false, monthlyUsdCents: 200 },
      reservation: { graceDays: 7 }
    });
    hostingApi.paymentInstructions.mockResolvedValue(INSTRUCTIONS);
  });

  it("an expired tenant renewing is NOT told the name will be released", async () => {
    // The sweep only reclaims inactive rows with no payments; an expired tenant's
    // name is safe, so the reservation notice would be false and alarming.
    hostingApi.createTenant.mockRejectedValue(new Error("Username already registered"));
    hostingApi.tenant.mockResolvedValue({
      username: "alice",
      owner: "alice",
      subscriptionStatus: "expired",
      subscriptionExpiresAt: "2026-08-01T00:00:00.000Z"
    });

    renderWithQueryClient(<HostingSignup />);
    fireEvent.click(screen.getByText("g.continue"));
    fireEvent.click(await screen.findByText("g.continue"));

    await screen.findAllByText("hosting.term-months");
    expect(screen.queryByText("hosting.reservation-grace")).toBeNull();
  });
});

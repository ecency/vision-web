import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithQueryClient } from "@/specs/test-utils";

// The Pro free-blog claim passes through the same customize step as the paid
// signup: template, accent, fonts and an identity prefilled from the profile.
// These specs pin the claim payload, since a field silently dropped here is a
// claimant staring at a default-looking blog they thought they had styled.

const mocks = vi.hoisted(() => ({
  accessToken: "tok-alice" as string | undefined,
  templates: vi.fn(),
  tenant: vi.fn()
}));

vi.mock("@/utils", () => ({
  getAccessToken: () => mocks.accessToken,
  random: vi.fn()
}));

vi.mock("@/features/hosting-signup/hosting-api", async () => {
  const actual = await vi.importActual<any>("@/features/hosting-signup/hosting-api");
  return {
    ...actual,
    hostingApi: { ...actual.hostingApi, templates: mocks.templates, tenant: mocks.tenant }
  };
});

import { ProBlogClaim } from "@/features/pro/pro-blog-claim";
import { getAccountFullQueryOptions, QueryKeys } from "@ecency/sdk";

const TEMPLATES = [
  {
    id: "medium",
    name: "Medium",
    tagline: "Clean",
    isDefault: true,
    colors: { background: "#fff", surface: "#fafafa", accent: "#111", text: "#111" },
    headingStyle: "serif"
  },
  {
    id: "journal",
    name: "Journal",
    tagline: "Ink on paper",
    isDefault: false,
    colors: { background: "#faf8f4", surface: "#f2efe8", accent: "#9c4a1e", text: "#221d17" },
    headingStyle: "serif"
  }
];

describe("ProBlogClaim customize step", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.accessToken = "tok-alice";
    mocks.templates.mockResolvedValue({ templates: TEMPLATES });
    // No blog yet: the probe 404s, so the customize form renders.
    mocks.tenant.mockRejectedValue(new Error("Tenant not found"));
    vi.mocked(getAccountFullQueryOptions as any).mockImplementation(() => ({
      queryKey: QueryKeys.accounts.full("alice"),
      queryFn: async () => ({
        profile: { name: "Alice in Chains", about: "Notes from the chain" }
      })
    }));
    fetchSpy = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        created: true,
        tenant: { blogUrl: "https://alice.blogs.ecency.com" }
      })
    } as any);
  });

  it("prefills identity from the profile and sends the chosen customization", async () => {
    renderWithQueryClient(<ProBlogClaim username="alice" />);

    // Identity prefilled from the profile once it loads.
    await waitFor(() =>
      expect(screen.getByDisplayValue("Alice in Chains")).toBeTruthy()
    );
    expect(screen.getByDisplayValue("Notes from the chain")).toBeTruthy();

    // Pick a template card, a quick-pick accent and a font preset.
    fireEvent.click(await screen.findByRole("radio", { name: /Journal/ }));
    fireEvent.click(screen.getByRole("button", { name: "#0066cc" }));
    fireEvent.change(screen.getByLabelText("hosting.fonts-label"), {
      target: { value: "editorial" }
    });

    fireEvent.click(screen.getByRole("button", { name: "pro-blog.claim" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/hosting/claim-blog");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      code: "tok-alice",
      title: "Alice in Chains",
      description: "Notes from the chain",
      styleTemplate: "journal",
      accent: "#0066cc",
      fontPreset: "editorial"
    });

    // Success shows the claimed blog link.
    await screen.findByText("pro-blog.claimed-title");
  });

  it("shows the manage pointer instead of the form when the blog already exists", async () => {
    // The claim endpoint returns an existing live tenant UNCHANGED, so a form
    // whose every field would be silently discarded must not render at all.
    mocks.tenant.mockResolvedValue({
      username: "alice",
      subscriptionStatus: "active",
      blogUrl: "https://alice.blogs.ecency.com"
    });
    renderWithQueryClient(<ProBlogClaim username="alice" />);

    await screen.findByText("pro-blog.already-title");
    expect(screen.queryByRole("button", { name: "pro-blog.claim" })).toBeNull();
    expect(screen.getByText("https://alice.blogs.ecency.com")).toBeTruthy();
  });

  it("reports a raced claim as already existing, never as an applied customization", async () => {
    // The blog appeared between the probe and the click (another tab): the
    // endpoint returns it unchanged and flags created: false.
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        created: false,
        tenant: { blogUrl: "https://alice.blogs.ecency.com" }
      })
    } as any);
    renderWithQueryClient(<ProBlogClaim username="alice" />);
    await waitFor(() =>
      expect(screen.getByDisplayValue("Alice in Chains")).toBeTruthy()
    );
    const button = screen.getByRole("button", {
      name: "pro-blog.claim"
    }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);

    await screen.findByText("pro-blog.already-title");
    expect(screen.queryByText("pro-blog.claimed-title")).toBeNull();
  });

  it("degrades a stalled catalog to a failure instead of disabling the claim forever", async () => {
    mocks.templates.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<ProBlogClaim username="alice" settleTimeoutMs={20} />);

    await screen.findByText("hosting.template-load-failed");
    const button = screen.getByRole("button", {
      name: "pro-blog.claim"
    }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it("fails a stalled existence probe open to claimable", async () => {
    // The probe gates the claim the same way the catalog does, so it gets
    // the same bound. Letting a real-but-slow existing blog through is safe:
    // the endpoint answers created: false and the already-exists state shows.
    mocks.tenant.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<ProBlogClaim username="alice" settleTimeoutMs={20} />);

    const button = (await screen.findByRole("button", {
      name: "pro-blog.claim"
    })) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it("blocks the claim until the catalog and prefill settle", async () => {
    // The claim is one-shot on the hosting side (an existing live tenant is
    // returned unchanged), so a quick click before the customization data
    // arrives would permanently lock in a default-looking config.
    mocks.templates.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<ProBlogClaim username="alice" />);

    await waitFor(() =>
      expect(screen.getByDisplayValue("Alice in Chains")).toBeTruthy()
    );
    const button = screen.getByRole("button", {
      name: "pro-blog.claim"
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("still claims with no customization when the catalog fails to load", async () => {
    mocks.templates.mockRejectedValue(new Error("down"));
    vi.mocked(getAccountFullQueryOptions as any).mockImplementation(() => ({
      queryKey: QueryKeys.accounts.full("alice"),
      queryFn: async () => ({ profile: {} })
    }));
    renderWithQueryClient(<ProBlogClaim username="alice" />);

    await screen.findByText("hosting.template-load-failed");
    fireEvent.click(screen.getByRole("button", { name: "pro-blog.claim" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [, init] = fetchSpy.mock.calls[0];
    // Nothing chosen and nothing prefilled: the payload carries only the code,
    // so the claim degrades to exactly the pre-customize behavior.
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      code: "tok-alice"
    });
  });
});

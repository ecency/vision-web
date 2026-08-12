import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithQueryClient } from "@/specs/test-utils";

// The Pro free-blog claim passes through the same customize step as the paid
// signup: template, accent, fonts and an identity prefilled from the profile.
// These specs pin the claim payload, since a field silently dropped here is a
// claimant staring at a default-looking blog they thought they had styled.

const mocks = vi.hoisted(() => ({
  accessToken: "tok-alice" as string | undefined,
  templates: vi.fn()
}));

vi.mock("@/utils", () => ({
  getAccessToken: () => mocks.accessToken,
  random: vi.fn()
}));

vi.mock("@/features/hosting-signup/hosting-api", async () => {
  const actual = await vi.importActual<any>("@/features/hosting-signup/hosting-api");
  return { ...actual, hostingApi: { ...actual.hostingApi, templates: mocks.templates } };
});

import { ProBlogClaim } from "@/features/pro/pro-blog-claim";
import { getAccountFullQueryOptions } from "@ecency/sdk";

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
    vi.mocked(getAccountFullQueryOptions as any).mockImplementation(() => ({
      queryKey: ["account", "alice"],
      queryFn: async () => ({
        profile: { name: "Alice in Chains", about: "Notes from the chain" }
      })
    }));
    fetchSpy = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ tenant: { blogUrl: "https://alice.blogs.ecency.com" } })
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

  it("still claims with no customization when the catalog fails to load", async () => {
    mocks.templates.mockRejectedValue(new Error("down"));
    vi.mocked(getAccountFullQueryOptions as any).mockImplementation(() => ({
      queryKey: ["account", "alice"],
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

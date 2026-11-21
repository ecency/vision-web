import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/features/i18n", () => ({ initI18next: async () => {} }));

vi.mock("@/app/_components/landing-page/landing-hero-actions", () => ({
  LandingHeroActions: () => null
}));
vi.mock("@/app/_components/landing-page/landing-subscribe-form", () => ({
  LandingSubscribeForm: () => null
}));
vi.mock("@/app/_components/landing-page/landing-sign-in-link", () => ({
  LandingSignInLink: () => null
}));
vi.mock("@/app/_components/landing-page/landing-download-links", () => ({
  LandingDownloadLinks: () => null
}));
vi.mock("@/app/_components/landing-page/landing-trending", () => ({
  LandingTrending: () => null,
  LandingTrendingSkeleton: () => null
}));
vi.mock("@/app/_components/landing-page/landing-explore", () => ({
  LandingExplore: () => null
}));
vi.mock("@/app/_components/landing-page/landing-community-preview", () => ({
  LandingCommunityPreview: () => null
}));
vi.mock("@/features/newsletter/runtime", () => ({
  NewsletterGate: ({ children }: any) => <>{children}</>
}));
vi.mock("@/features/hosting-signup/hosting-api", () => ({
  hostingApi: { isConfigured: () => false }
}));

import { LandingPage } from "@/app/_components/landing-page";

describe("landing footer", () => {
  it("links to hive.io with a dofollow rel", async () => {
    render(await LandingPage());

    const link = screen.getByRole("link", { name: "landing-page.footer-powered-by-hive" });
    expect(link).toHaveAttribute("href", "https://hive.io");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.closest("footer")).not.toBeNull();

    const rel = (link.getAttribute("rel") ?? "").split(/\s+/);
    expect(rel).toContain("noopener");
    for (const banned of ["nofollow", "ugc", "sponsored"]) {
      expect(rel).not.toContain(banned);
    }
  });
});

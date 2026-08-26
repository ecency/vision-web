import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom";

// The global i18next mock has no event emitter, and the layout subscribes to
// languageChanged on mount.
vi.mock("i18next", () => ({
  default: {
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
    on: vi.fn(),
    off: vi.fn()
  }
}));

const usePathnameMock = vi.fn(() => "/signup");
vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn() })
}));
vi.mock("@/features/shared/feedback", () => ({
  Feedback: () => null
}));
vi.mock("@/features/shared/navbar", () => ({
  Navbar: () => null
}));
vi.mock("@/features/metadata", () => ({
  PagesMetadataGenerator: { getForPage: vi.fn(async () => ({})) }
}));

import { SignupLayoutClient } from "@/app/signup/_components/signup-layout-client";
import SignupPage from "@/app/signup/page";

// React hoists rendered <link> elements into <head>, so query the document.
const heroPreload = () =>
  document.head.querySelector('link[rel="preload"][href="/assets/signup-main.svg"]');

describe("signup LCP images", () => {
  afterEach(() => {
    cleanup();
    // Hoisted links survive RTL cleanup; drop them so cases stay isolated.
    document.head.querySelectorAll('link[rel="preload"]').forEach((el) => el.remove());
  });

  describe("desktop hero (signup-main.svg)", () => {
    it("preloads the hero for md+ viewports at high priority", () => {
      usePathnameMock.mockReturnValue("/signup");
      render(<SignupLayoutClient>content</SignupLayoutClient>);

      const link = heroPreload();
      expect(link).not.toBeNull();
      expect(link).toHaveAttribute("as", "image");
      expect(link).toHaveAttribute("media", "(min-width: 768px)");
      expect(link).toHaveAttribute("fetchpriority", "high");
    });

    it("keeps the hero <img> lazy so hidden-on-mobile never fetches it", () => {
      // The preload's media query is what scopes the fetch to desktop; the
      // <img> itself must stay lazy, or an eager display:none image would
      // download the file on mobile anyway.
      usePathnameMock.mockReturnValue("/signup");
      const { container } = render(<SignupLayoutClient>content</SignupLayoutClient>);

      const hero = container.querySelector('img[src="/assets/signup-main.svg"]');
      expect(hero).not.toBeNull();
      expect(hero).toHaveAttribute("loading", "lazy");
    });

    it("emits no preload on sub-pages that hide the header", () => {
      usePathnameMock.mockReturnValue("/signup/free");
      const { container } = render(<SignupLayoutClient>content</SignupLayoutClient>);

      expect(heroPreload()).toBeNull();
      expect(container.querySelector('img[src="/assets/signup-main.svg"]')).toBeNull();
    });
  });

  describe("option cards", () => {
    it("loads the first card's illustration eagerly at high priority", async () => {
      const ui = await SignupPage({ searchParams: Promise.resolve({}) });
      const { container } = render(ui);

      const mailbox = container.querySelector('img[src="/assets/undraw-mailbox.svg"]');
      expect(mailbox).not.toBeNull();
      expect(mailbox).toHaveAttribute("fetchpriority", "high");
      expect(mailbox).not.toHaveAttribute("loading", "lazy");
    });

    it("leaves the remaining card illustrations lazy", async () => {
      const ui = await SignupPage({ searchParams: Promise.resolve({}) });
      const { container } = render(ui);

      const creditCard = container.querySelector('img[src="/assets/undraw-credit-card.svg"]');
      expect(creditCard).not.toBeNull();
      expect(creditCard).toHaveAttribute("loading", "lazy");
    });
  });
});

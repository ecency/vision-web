import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/features/shared/navbar", () => ({ Navbar: () => null }));
vi.mock("@/features/shared/scroll-to-top", () => ({ ScrollToTop: () => null }));
vi.mock("@/features/shared/theme", () => ({ Theme: () => null }));
vi.mock("@/features/metadata", () => ({ PagesMetadataGenerator: { getForPage: vi.fn() } }));
vi.mock("@/features/i18n", () => ({ ensureFaqLoaded: vi.fn(async () => undefined) }));

import About from "@/app/(staticPages)/about/page";

describe("about page downloads block", () => {
  it("renders its heading and text through i18next, not English literals", async () => {
    render(await About());
    expect(screen.getByText("static.about.downloads-title")).toBeInTheDocument();
    expect(screen.getByText("static.about.downloads-text")).toBeInTheDocument();
    expect(screen.queryByText(/Enjoy Ecency for/)).toBeNull();
  });
});

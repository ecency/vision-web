import { vi, describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import "@testing-library/jest-dom";

import { NavbarMainSidebarToggle } from "@/features/shared/navbar/navbar-main-sidebar-toggle";
import { NavbarSearchShell } from "@/features/shared/navbar/navbar-search-shell";

/*
  Pins for #1664: the navbar must be complete at first paint.
*/
describe("NavbarMainSidebarToggle logo", () => {
  it("is not lazy-loaded (paints with the first frame)", () => {
    const { container } = render(<NavbarMainSidebarToggle onClick={vi.fn()} />);
    const img = container.querySelector("img.logo");
    expect(img).toBeInTheDocument();
    // next/image without `priority` emits loading="lazy", which deferred the
    // request past the first layout and made the logo pop in at ~2.4s.
    expect(img).not.toHaveAttribute("loading", "lazy");
  });
});

describe("NavbarSearchShell", () => {
  it("server-renders the idle search input markup", () => {
    // renderToString runs no effects, exactly like the server.
    const html = renderToString(<NavbarSearchShell />);
    expect(html).toContain("suggestion relative");
    expect(html).toContain("search-box");
    expect(html).toContain('placeholder="search.placeholder"');
    expect(html).toContain("<input");
  });
});

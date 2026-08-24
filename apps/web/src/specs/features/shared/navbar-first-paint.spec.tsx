import { vi, describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import "@testing-library/jest-dom";

const captured = vi.hoisted(() => ({ dynamicOptions: [] as Array<Record<string, unknown>> }));
vi.mock("next/dynamic", () => ({
  default: (_importer: unknown, opts?: Record<string, unknown>) => {
    captured.dynamicOptions.push(opts ?? {});
    return () => null;
  }
}));

import { NavbarMainSidebarToggle } from "@/features/shared/navbar/navbar-main-sidebar-toggle";
import { NavbarSearchShell } from "@/features/shared/navbar/navbar-search-shell";
import "@/features/shared/navbar/navbar-search-dynamic";

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

describe("Search dynamic handoff", () => {
  it("keeps the shell visible while the search chunk loads", () => {
    /*
      When isDesktop flips true, the slot swaps to the dynamic component;
      Next's DEFAULT loading state renders null, which would flash the slot
      empty until the chunk arrives. The dynamic() options must therefore
      provide the shell as the loading fallback (#1665 review).
    */
    // Other modules in the import graph may register their own dynamic()
    // components; find the one whose loading fallback renders the shell.
    const fallbacks = captured.dynamicOptions
      .filter((o) => typeof o.loading === "function")
      .map((o) => renderToString((o.loading as () => JSX.Element)()));
    const shellFallback = fallbacks.find((html) => html.includes("search-box"));
    expect(shellFallback).toBeDefined();
    expect(shellFallback).toContain('placeholder="search.placeholder"');
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

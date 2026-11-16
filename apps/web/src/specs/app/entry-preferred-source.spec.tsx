import fs from "fs";
import path from "path";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EntryPreferredSource } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-preferred-source";

const ROUTE = path.resolve(__dirname, "../../app/(dynamicPages)/entry/[category]/[author]/[permlink]");

describe("EntryPreferredSource (#1495)", () => {
  it("links to Google's Preferred Sources picker for ecency.com", () => {
    render(<EntryPreferredSource base="https://ecency.com" />);
    const link = screen.getByRole("link", { name: "entry.preferred-source" });
    expect(link.getAttribute("href")).toBe("https://google.com/preferences/source?q=ecency.com");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener");
  });

  it("records a Plausible event when the link is clicked", () => {
    const plausible = vi.fn();
    (window as Window & { plausible?: unknown }).plausible = plausible;
    render(<EntryPreferredSource base="https://ecency.com" />);
    fireEvent.click(screen.getByRole("link", { name: "entry.preferred-source" }));
    expect(plausible).toHaveBeenCalledWith("Preferred Source: Click", undefined);
    delete (window as Window & { plausible?: unknown }).plausible;
  });

  it("renders nothing on any other host", () => {
    const { container } = render(<EntryPreferredSource base="https://blog.example.com" />);
    expect(container.innerHTML).toBe("");
  });

  it("is wired into the post footer with the request's site base", () => {
    const page = fs.readFileSync(path.join(ROUTE, "page.tsx"), "utf8");
    const content = fs.readFileSync(path.join(ROUTE, "_components/entry-page-content-ssr.tsx"), "utf8");
    expect(page).toMatch(/<EntryPageContentSSR[^>]*\bbase=\{base\}/);
    expect(content).toMatch(/<EntryPreferredSource base=\{base\} \/>/);
  });
});

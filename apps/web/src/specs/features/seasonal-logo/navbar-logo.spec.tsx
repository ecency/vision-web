import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import defaults from "@/defaults";
import { ICONS } from "@/features/seasonal-logo/seasonal";
import { NavbarMainSidebarToggle } from "@/features/shared/navbar/navbar-main-sidebar-toggle";

const ASSETS = join(__dirname, "../../../../public/assets/seasonal-logo");
const languages = (list: string[]) => vi.spyOn(navigator, "languages", "get").mockReturnValue(list);
const logo = (c: HTMLElement) => c.querySelector("img.logo")!.getAttribute("src");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the navbar logo's seasonal skin", () => {
  it("is the everyday logo on a plain day", () => {
    vi.setSystemTime(new Date(2026, 7, 10, 12));
    languages(["en-US"]);
    const { container } = render(<NavbarMainSidebarToggle onClick={vi.fn()} />);
    expect(logo(container)).toBe(defaults.logo);
  });

  it("wears the celebration on its days, by the browser's region", () => {
    // Black Friday 2026 is regional: kept in the US, not in Japan
    vi.setSystemTime(new Date(2026, 10, 27, 9));
    languages(["en-US"]);
    const us = render(<NavbarMainSidebarToggle onClick={vi.fn()} />);
    expect(logo(us.container)).toBe("/assets/seasonal-logo/BlackFriday.svg");
    us.unmount();
    languages(["ja-JP"]);
    expect(logo(render(<NavbarMainSidebarToggle onClick={vi.fn()} />).container)).toBe(defaults.logo);
  });

  it("wears a global celebration everywhere", () => {
    vi.setSystemTime(new Date(2027, 0, 1, 10));
    languages(["ja-JP"]);
    expect(logo(render(<NavbarMainSidebarToggle onClick={vi.fn()} />).container)).toBe("/assets/seasonal-logo/NewYear.svg");
  });

  it("is the everyday logo in the server's HTML, so a cached page never shows another day's skin", () => {
    vi.setSystemTime(new Date(2027, 0, 1, 10));
    expect(renderToString(<NavbarMainSidebarToggle onClick={vi.fn()} />)).toContain(defaults.logo);
    expect(renderToString(<NavbarMainSidebarToggle onClick={vi.fn()} />)).not.toContain("seasonal-logo");
  });

  it("changes at the reader's midnight while the page stays open", () => {
    vi.setSystemTime(new Date(2026, 10, 26, 23, 59, 30));
    languages(["en-US"]);
    const { container } = render(<NavbarMainSidebarToggle onClick={vi.fn()} />);
    expect(logo(container)).toBe(defaults.logo);
    act(() => vi.advanceTimersByTime(31_000));
    expect(logo(container)).toBe("/assets/seasonal-logo/BlackFriday.svg");
  });

  it("has an SVG for every celebration, and none for anything else", () => {
    const skins = ICONS.filter((i) => i !== "Default");
    for (const icon of skins) expect(existsSync(join(ASSETS, `${icon}.svg`)), icon).toBe(true);
    expect(readdirSync(ASSETS).sort()).toEqual(skins.map((i) => `${i}.svg`).sort());
  });
});

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { THEME_INIT_SCRIPT } from "@/app/_components/theme-init-script";

// #1262: the root layout read the theme cookie on the server, but the SSR cache
// key does not include that cookie. An anonymous dark-mode visitor primed a
// cached page that light-mode visitors were then served (and the other way
// round). The theme class is now set in the browser before first paint, from
// the same cookie the client store reads, so the server HTML is theme-neutral.

const here = dirname(fileURLToPath(import.meta.url));
const layoutSource = readFileSync(resolve(here, "../../app/layout.tsx"), "utf8");
const providersSource = readFileSync(resolve(here, "../../app/client-providers.tsx"), "utf8");

function clearCookies() {
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

function runScript() {
  new Function(THEME_INIT_SCRIPT)();
}

describe("theme pre-paint script", () => {
  afterEach(() => {
    clearCookies();
    document.documentElement.className = "";
    document.body.className = "";
  });

  it("puts the dark class on html and body for theme=night", () => {
    document.cookie = "other=1";
    document.cookie = "theme=night";
    runScript();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.body.classList.contains("dark")).toBe(true);
  });

  it("leaves both light for theme=day or no cookie", () => {
    document.cookie = "theme=day";
    runScript();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.body.classList.contains("dark")).toBe(false);

    clearCookies();
    runScript();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("does not match a cookie that only ends in theme", () => {
    document.cookie = "oldtheme=night";
    runScript();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("keeps the other classes on html", () => {
    document.documentElement.className = "__variable_font";
    document.cookie = "theme=night";
    runScript();
    expect(document.documentElement.className).toBe("__variable_font dark");
  });
});

describe("root layout", () => {
  it("no longer reads the theme cookie on the server", () => {
    expect(layoutSource).not.toMatch(/cookies\(\)/);
    expect(layoutSource).not.toMatch(/from "next\/headers"/);
  });

  it("stays request-time rendered, as it was with the cookie read", () => {
    expect(layoutSource).toMatch(/await connection\(\)/);
  });

  it("runs the script first in body and tolerates the class it adds", () => {
    expect(layoutSource).toMatch(/<body suppressHydrationWarning>\s*<script dangerouslySetInnerHTML=\{\{ __html: THEME_INIT_SCRIPT \}\} \/>/);
    expect(layoutSource).toMatch(/<html\s+lang="en"\s+suppressHydrationWarning/);
  });

  it("re-applies the class on every page after React renders the root on the client", () => {
    // <html> and <body> are React singletons: a client render of the root
    // resets their attributes to the props, which no longer carry `dark`.
    expect(providersSource).toMatch(/<Theme \/>/);
  });
});

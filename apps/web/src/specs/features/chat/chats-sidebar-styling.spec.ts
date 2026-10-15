import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for the chats left-pane "3-dot menu is invisible / can't be
 * found" bug.
 *
 * The root causes were *phantom* styling that produces NO CSS at runtime:
 *   1. The per-channel kebab trigger was a bare `gray-link` icon (text-gray-600,
 *      ~3.7:1 on the dark rail) with no hover/focus surface, so users could not
 *      find it.
 *   2. The active/hover channel highlight used Tailwind palette keys that do not
 *      exist in this project's config (`blue-50`, `blue-500`, `blue-600`,
 *      `blue-900`) — they emit zero CSS, so active channels looked inactive.
 *   3. The whole chat feature relies on CSS custom properties
 *      (`--surface-color`, `--text-muted`, ...) that were defined nowhere, so
 *      surfaces/badges fell back to transparent/inherited values.
 *
 * These are asserted at the source/theme level on purpose: jsdom does not
 * compile Tailwind or resolve `var(--x)`, so a rendered-DOM test would happily
 * pass with phantom classes and undefined variables (the className strings still
 * exist, they just paint nothing). A contract test on the source is the only
 * automatable guard that actually catches a reintroduction.
 */

const here = dirname(fileURLToPath(import.meta.url));
const webSrc = resolve(here, "../../..");

const read = (relativeToSrc: string) => readFileSync(resolve(webSrc, relativeToSrc), "utf8");

const chatsClient = read("app/chats/_components/chats-client.tsx");
const themeNight = read("styles/theme-night.scss");
const themeDay = read("styles/theme-day.scss");

describe("chats sidebar styling", () => {
  // Tailwind keys that do NOT exist in this project's palette (tailwind.config.ts
  // replaces the default colors and only defines named blue keys like
  // `blue-dark-sky`). Any of these emit no CSS and must never come back.
  const phantomTailwindKeys = [
    "bg-blue-50",
    "border-blue-500",
    "border-blue-600",
    "bg-blue-900",
    "text-blue-500",
    "text-blue-600"
  ];

  it.each(phantomTailwindKeys)(
    "does not use the non-existent Tailwind key %s",
    (key) => {
      expect(chatsClient).not.toContain(key);
    }
  );

  it("gives the kebab trigger a discoverable affordance (visible in dark mode + hover/focus surface)", () => {
    // The kebab keeps appearance="gray-link" but must add real chrome.
    expect(chatsClient).toContain("dark:text-gray-300");
    expect(chatsClient).toContain("dark:hover:bg-dark-default");
    expect(chatsClient).toContain("focus-visible:ring");
    // The shared class is applied to the menu buttons.
    expect(chatsClient).toContain("className={KEBAB_BUTTON_CLASS}");
  });

  it("uses borderless list rows: filled active state + left accent + hover fill, not bordered cards", () => {
    // Modern messaging-list style: rows have no per-row border box. Active row is
    // a fill plus a subtle 2px left accent; inactive rows show a hover fill.
    expect(chatsClient).toContain("rounded-lg border-l-2 p-1.5 transition");
    expect(chatsClient).toContain("border-blue-dark-sky bg-blue-duck-egg dark:bg-dark-default");
    expect(chatsClient).toContain("border-transparent hover:bg-gray-100 focus-within:bg-gray-100 dark:hover:bg-white/5");
    // The old bordered-card row must not come back.
    expect(chatsClient).not.toContain('"rounded border p-3 transition"');
  });

  it("constrains channel-list grids to grid-cols-1 so a long name cannot blow out the column and clip the kebab", () => {
    // A bare `grid gap-*` uses a single implicit `auto` column that sizes to the
    // widest card's max-content; a long, truncated (nowrap) channel name then
    // pushes the unread badge + kebab past overflow-x-hidden, clipping them off
    // the right edge. grid-cols-1 (minmax(0,1fr)) makes the column shrink to the
    // rail width so names truncate instead.
    // The card/section grids (gap-2 / gap-4) must not be bare. (gap-1 elsewhere
    // is the error-message list, whose text wraps and cannot blow out a column.)
    expect(chatsClient).not.toContain('className="grid gap-2"');
    expect(chatsClient).not.toContain('className="grid gap-4"');
    expect(chatsClient).toContain("grid grid-cols-1 gap-2");
    expect(chatsClient).toContain("grid grid-cols-1 gap-1");
  });

  it("reserves width for every channel-actions wrapper so the kebab cannot be squeezed out at narrow widths", () => {
    // Each per-channel actions container must be flex-shrink-0; otherwise a long
    // channel name in a narrow rail could shrink/clip the kebab on some screens.
    const wrappers = chatsClient.match(/className="[^"]*"\s+data-chat-channel-actions/g) ?? [];
    expect(wrappers.length).toBeGreaterThan(0);
    for (const wrapper of wrappers) {
      expect(wrapper).toContain("flex-shrink-0");
    }
  });

  // The chat feature consumes these custom properties; they must be defined in
  // BOTH themes or the sidebar renders without surfaces/muted text/badges.
  const requiredChatTokens = [
    "--surface-color",
    "--background-color",
    "--text-color",
    "--text-muted",
    "--primary-color",
    "--primary-button-text-color",
    "--hover-color"
  ];

  it.each(requiredChatTokens)("defines %s in the dark theme", (token) => {
    expect(themeNight).toContain(`${token}:`);
  });

  it.each(requiredChatTokens)("defines %s in the light theme", (token) => {
    expect(themeDay).toContain(`${token}:`);
  });
});

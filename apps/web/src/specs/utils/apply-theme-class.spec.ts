import { beforeEach, describe, expect, it } from "vitest";
import { applyThemeClass } from "@/utils/apply-theme-class";
import { Theme } from "@/enums";

/**
 * The dark class must land on BOTH <html> and <body>.
 *
 * <html> is what the checkout components probe
 * (`document.documentElement.classList.contains("dark")`); before this they read
 * a class that only existed on body and always rendered light.
 *
 * <body> must keep it because styles/theme-day.scss assigns the light custom
 * properties, background and color DIRECTLY to `body` while theme-night.scss
 * scopes its dark values under `.dark`. Remove it from body and body's own
 * declarations beat the inherited dark ones — a light body with Tailwind dark
 * variants active.
 */
describe("applyThemeClass", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    document.body.classList.remove("dark");
  });

  const isDark = () => ({
    html: document.documentElement.classList.contains("dark"),
    body: document.body.classList.contains("dark")
  });

  it("sets dark on both html and body for night", () => {
    applyThemeClass(Theme.night);
    expect(isDark()).toEqual({ html: true, body: true });
  });

  it("clears dark from both for day", () => {
    applyThemeClass(Theme.night);
    applyThemeClass(Theme.day);
    expect(isDark()).toEqual({ html: false, body: false });
  });

  it("never leaves the two elements disagreeing", () => {
    for (const theme of [Theme.night, Theme.day, Theme.night, Theme.night, Theme.day]) {
      applyThemeClass(theme);
      const { html, body } = isDark();
      expect(html).toBe(body);
    }
  });

  it("is idempotent — re-applying the same theme does not flip it", () => {
    applyThemeClass(Theme.night);
    applyThemeClass(Theme.night);
    expect(isDark()).toEqual({ html: true, body: true });

    applyThemeClass(Theme.day);
    applyThemeClass(Theme.day);
    expect(isDark()).toEqual({ html: false, body: false });
  });

  // Settings offers day / night / system. `system` is resolved to a concrete
  // day|night by toggleTheme (via use_system_theme + matchMedia) before it
  // reaches here, but if an unresolved value did arrive it must render light —
  // matching what the server rendered from the theme cookie — rather than
  // disagreeing with it.
  it("treats an unresolved 'system' value as light, consistent with SSR", () => {
    applyThemeClass(Theme.night);
    applyThemeClass(Theme.system);
    expect(isDark()).toEqual({ html: false, body: false });
  });

  it("treats undefined (no theme cookie) as light", () => {
    applyThemeClass(Theme.night);
    applyThemeClass(undefined);
    expect(isDark()).toEqual({ html: false, body: false });
  });
});

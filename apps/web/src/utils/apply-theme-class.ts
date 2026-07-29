import { Theme } from "@/enums";

/**
 * Single place that decides WHERE the dark class lives, so the store toggle and
 * the <Theme/> effect cannot drift apart.
 *
 * The class goes on BOTH elements, deliberately:
 *  - `documentElement` — the checkout components (pro, gift-card, stripe,
 *    hosting) read `document.documentElement.classList.contains("dark")`.
 *  - `body` — `styles/theme-day.scss` assigns the light custom properties,
 *    `background` and `color` DIRECTLY to `body`, while `theme-night.scss`
 *    applies its dark values under `.dark`. Drop the class from body and its own
 *    light declarations beat the merely-inherited dark ones, leaving a light body
 *    and light Bootstrap/CSS-variable surfaces while Tailwind dark variants are
 *    active.
 */
export function applyThemeClass(theme: Theme | string | undefined): void {
  if (typeof document === "undefined") {
    return;
  }

  // Only `night` is dark. `system` is resolved to a concrete day/night by the
  // caller before it gets here; if an unresolved value ever arrives, treating it
  // as light matches what the server rendered from the theme cookie, so the two
  // stay consistent rather than flashing apart.
  const isNight = theme === Theme.night;

  document.documentElement.classList.toggle("dark", isNight);
  document.body?.classList.toggle("dark", isNight);
}

/**
 * Sets the dark class before first paint, in the browser (#1262).
 *
 * The root layout used to read the `theme` cookie on the server. That cookie is
 * not part of the SSR cache key, so an anonymous dark-mode visitor primed a
 * cached page that light-mode visitors were then served, and the other way
 * round. The server HTML is now theme-neutral and this runs as the first child
 * of <body>, before any of the page paints.
 *
 * It reads the same cookie the client store starts from (global-module.ts) and
 * puts the class on both <html> and <body>, as `applyThemeClass` does; see that
 * file for why both. `<Theme/>`, mounted in the client providers on every
 * page, keeps the class in step after hydration and after any client render of
 * the root, which resets <html> and <body> to their props.
 */
export const THEME_INIT_SCRIPT =
  "try{if(/(?:^|;\\s*)theme=night(?:;|$)/.test(document.cookie)){" +
  "document.documentElement.classList.add('dark');document.body.classList.add('dark')}}catch(e){}";

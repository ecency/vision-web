import i18next from "i18next";
import { SearchBox } from "../search-box";

/**
 * Server-renderable stand-in for the desktop navbar Search (#1664).
 *
 * The real Search is a `dynamic({ssr:false})` chunk gated on a client-set
 * `isDesktop`, so its slot used to server-render empty and the input popped
 * in seconds after first paint. This shell reuses the same lightweight
 * SearchBox inside the same idle SuggestionList wrapper markup
 * (`suggestion relative` + trailing div), so it is pixel-identical to the
 * idle live component and is replaced in place when Search mounts.
 *
 * Deliberately NOT the live placeholder: the live one interpolates
 * searchIndexCount, which is client data; the shell always shows the plain
 * placeholder so the server output is stable. The input is readOnly until
 * the live component takes over.
 */
export function NavbarSearchShell() {
  return (
    <div className="suggestion relative">
      <SearchBox placeholder={i18next.t("search.placeholder")} value="" readOnly={true} />
      <div />
    </div>
  );
}

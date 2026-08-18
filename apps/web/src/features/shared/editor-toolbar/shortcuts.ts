import { KeyboardEvent } from "react";
import { detectEvent } from "./events";

/**
 * Ctrl/Cmd formatting shortcuts. These are the ones every editor on the web
 * binds, so people press them here too and expect the same result.
 *
 * Firefox binds Ctrl+B to the bookmarks sidebar and Ctrl+I to page info, so the
 * keystroke has to be claimed with preventDefault or the browser takes it.
 */
const CTRL_SHORTCUTS: Record<string, string> = {
  b: "bold",
  i: "italic"
};

/** Legacy Alt shortcuts, advertised in the toolbar tooltips. */
const ALT_SHORTCUTS: Record<string, string> = {
  b: "bold",
  i: "italic",
  t: "table",
  k: "link",
  c: "codeBlock",
  d: "image",
  m: "blockquote"
};

/**
 * The letter a shortcut is aimed at.
 *
 * `e.key` follows the keyboard layout and is the only safe source for Ctrl/Cmd
 * combos: on Dvorak, Cmd+C arrives as `key: "c", code: "KeyI"`, so reading the
 * physical key there would fire italic and swallow the copy.
 *
 * Alt combos on macOS report a typographic character in `e.key` instead
 * (Alt+B arrives as "∫"), which is why every Alt shortcut was dead on a Mac.
 * The physical key is the only thing left to go on, so it is used as a fallback
 * for those and only when `e.key` carries no letter at all.
 */
function shortcutLetter(
  e: Pick<KeyboardEvent, "key" | "code">,
  allowPhysicalKey: boolean
): string | null {
  if (typeof e.key === "string" && /^[a-z]$/i.test(e.key)) {
    return e.key.toLowerCase();
  }

  if (allowPhysicalKey && typeof e.code === "string" && /^Key[A-Z]$/.test(e.code)) {
    return e.code.charAt(3).toLowerCase();
  }

  return null;
}

/**
 * Maps a keydown on a markdown editor to a toolbar action and dispatches it.
 * Returns true when the keystroke was consumed.
 *
 * The action is broadcast on `window` and picked up by the toolbar that owns
 * the focused editor (see `EditorToolbar`), which is what keeps the insertion
 * in the composer the person is actually typing in.
 */
export function handleEditorShortcut(e: KeyboardEvent<HTMLElement>): boolean {
  const hasCtrl = e.ctrlKey || e.metaKey;

  // Alt+Ctrl and Shift combinations belong to the browser / OS, not to us.
  if (hasCtrl === e.altKey || e.shiftKey) {
    return false;
  }

  const letter = shortcutLetter(e, !hasCtrl);
  const action = letter ? (hasCtrl ? CTRL_SHORTCUTS : ALT_SHORTCUTS)[letter] : undefined;

  if (!action) {
    return false;
  }

  e.preventDefault();
  detectEvent(action);

  return true;
}

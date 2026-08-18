import { KeyboardEvent } from "react";
import { detectEvent } from "./index";

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
 * `e.key` is the right source for Ctrl/Cmd combos (it follows the keyboard
 * layout), but Alt combos on macOS report a typographic character there:
 * Alt+B arrives as "∫", which is why the Alt shortcuts never worked on a Mac.
 * `e.code` names the physical key and covers that case, so either match counts.
 */
function shortcutLetters(e: Pick<KeyboardEvent, "key" | "code">): string[] {
  const letters: string[] = [];

  if (typeof e.key === "string" && /^[a-z]$/i.test(e.key)) {
    letters.push(e.key.toLowerCase());
  }
  if (typeof e.code === "string" && /^Key[A-Z]$/.test(e.code)) {
    letters.push(e.code.charAt(3).toLowerCase());
  }

  return letters;
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

  const table = hasCtrl ? CTRL_SHORTCUTS : ALT_SHORTCUTS;
  const action = shortcutLetters(e)
    .map((letter) => table[letter])
    .find(Boolean);

  if (!action) {
    return false;
  }

  e.preventDefault();
  detectEvent(action);

  return true;
}

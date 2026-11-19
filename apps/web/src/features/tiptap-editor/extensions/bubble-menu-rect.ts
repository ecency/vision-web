import { type Editor, posToDOMRect } from "@tiptap/core";

export interface SelectionRectMemory {
  rect: DOMRect | null;
}

// Checked by name, not instanceof, so a DOMException from another realm matches.
function isDomDesync(error: unknown) {
  return (error as { name?: unknown } | null)?.name === "IndexSizeError";
}

// A text node the IME replaced (detached) measures as an all-zero rect, which
// would park the menu in the viewport corner.
function isEmptyRect(rect: DOMRect) {
  return !rect.x && !rect.y && !rect.width && !rect.height;
}

/**
 * Virtual floating-ui reference for the editor selection.
 *
 * floating-ui's autoUpdate calls getBoundingClientRect on scroll, resize and
 * layout changes, so it reads the live selection rather than the one at anchor
 * time. On Android the IME can shorten a text node before ProseMirror's DOM
 * observer flushes; a selection that is valid for the doc then points past the
 * end of the DOM text and coordsAtPos throws IndexSizeError (#2140). That throw
 * would surface as an unhandled rejection from floating-ui's computePosition,
 * so for that case return the last rect that measured (shared across
 * re-anchors through `memory`), or the editor's own box before any did.
 */
export function createSelectionReference(editor: Editor, memory: SelectionRectMemory) {
  return {
    getBoundingClientRect: () => {
      // autoUpdate can tick once between tiptap's deferred destroy and the menu
      // unmounting; the view (and its dom) throw on access by then.
      if (editor.isDestroyed) {
        return memory.rect ?? new DOMRect();
      }
      try {
        const { from, to } = editor.state.selection;
        const rect = posToDOMRect(editor.view, from, to);
        if (!isEmptyRect(rect)) {
          memory.rect = rect;
          return rect;
        }
      } catch (error) {
        if (!isDomDesync(error)) {
          throw error;
        }
      }
      return memory.rect ?? editor.view.dom.getBoundingClientRect();
    }
  };
}

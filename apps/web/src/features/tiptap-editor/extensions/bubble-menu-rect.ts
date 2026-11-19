import { posToDOMRect } from "@tiptap/core";

/**
 * Virtual floating-ui reference for the editor selection.
 *
 * floating-ui's autoUpdate calls getBoundingClientRect long after the anchor is
 * set (scroll, resize, layout). Positions captured at anchor time go stale when
 * the document shrinks (Android IME/autocorrect), and coordsAtPos then throws an
 * IndexSizeError inside the positioning pass (#2140). So read the live
 * selection, clamp it to the document, and never throw: fall back to the last
 * rect that measured.
 */
export function createSelectionReference(editor: any) {
  let lastRect = new DOMRect(0, 0, 0, 0);

  return {
    getBoundingClientRect: () => {
      try {
        const size = editor.state.doc.content.size;
        const { from, to } = editor.state.selection;
        lastRect = posToDOMRect(editor.view, Math.min(from, size), Math.min(to, size));
      } catch {
        // Selection points outside the current DOM; keep the previous rect.
      }
      return lastRect;
    }
  };
}

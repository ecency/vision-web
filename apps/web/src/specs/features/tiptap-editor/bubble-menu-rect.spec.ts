import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Editor, posToDOMRect } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  createSelectionReference,
  type SelectionRectMemory
} from "@/features/tiptap-editor/extensions/bubble-menu-rect";

// jsdom has no layout: give Ranges/Elements a rect so coordsAtPos can measure.
// Range.setEnd bounds checks are real, which is what throws IndexSizeError.
const RANGE_RECT = { x: 10, y: 20, top: 20, bottom: 30, left: 10, right: 15, width: 5, height: 10 };
const EDITOR_RECT = new DOMRect(100, 200, 300, 40);
beforeAll(() => {
  (Range.prototype as any).getClientRects = () => [RANGE_RECT];
  (Range.prototype as any).getBoundingClientRect = () => RANGE_RECT;
  (Element.prototype as any).getClientRects = () => [RANGE_RECT];
});

const TEXT = "abcdefghijklmnopqrstuvwxyz0123456"; // 33 chars, end of text = pos 34
const editors: Editor[] = [];

function makeEditor() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const editor = new Editor({ element: el, extensions: [StarterKit], content: `<p>${TEXT}</p>` });
  editor.view.dom.getBoundingClientRect = () => EDITOR_RECT;
  editors.push(editor);
  return editor;
}

// Android IME shortens the text node before ProseMirror's DOM observer flushes:
// the selection is still valid for the doc, but the DOM node is 2 chars shorter.
function desyncDom(editor: Editor) {
  const text = editor.view.dom.querySelector("p")!.firstChild as Text;
  text.deleteData(31, 2);
}

afterEach(() => {
  editors.splice(0).forEach((e) => e.destroy());
  document.body.innerHTML = "";
});

describe("bubble menu selection reference (#2140)", () => {
  it("reproduces the Sentry error on the raw tiptap path", () => {
    const editor = makeEditor();
    editor.commands.setTextSelection(34);
    desyncDom(editor);
    const { from, to } = editor.state.selection;

    let error: unknown;
    try {
      posToDOMRect(editor.view, from, to);
    } catch (e) {
      error = e;
    }
    // Chrome: "The offset 33 is larger than the node's length (31)."; jsdom words it differently.
    expect((error as DOMException)?.name).toBe("IndexSizeError");
  });

  it("does not throw when the DOM is out of sync with the selection", () => {
    const editor = makeEditor();
    editor.commands.setTextSelection(34);
    desyncDom(editor);
    const memory: SelectionRectMemory = { rect: null };

    expect(() => createSelectionReference(editor, memory).getBoundingClientRect()).not.toThrow();
  });

  it("keeps the last good rect across re-anchors", () => {
    const editor = makeEditor();
    editor.commands.setTextSelection(34);
    const memory: SelectionRectMemory = { rect: null };
    const good = createSelectionReference(editor, memory).getBoundingClientRect();
    expect(good.width).toBe(0); // collapsed cursor: start/end share a rect edge

    desyncDom(editor);
    // anchorToSelection builds a NEW reference on every selectionUpdate
    const rect = createSelectionReference(editor, memory).getBoundingClientRect();

    expect([rect.x, rect.y, rect.height]).toEqual([good.x, good.y, good.height]);
    expect(rect.y).not.toBe(0);
  });

  it("falls back to the editor box, not the page corner, when nothing measured yet", () => {
    const editor = makeEditor();
    editor.commands.setTextSelection(34);
    desyncDom(editor);

    const rect = createSelectionReference(editor, { rect: null }).getBoundingClientRect();

    expect([rect.x, rect.y, rect.width, rect.height]).toEqual([100, 200, 300, 40]);
  });

  it("rethrows errors that are not the IME desync", () => {
    const editor = makeEditor();
    const ref = createSelectionReference(editor, { rect: null });
    editor.view.coordsAtPos = () => {
      throw new TypeError("boom");
    };

    expect(() => ref.getBoundingClientRect()).toThrow(TypeError);
  });

  it("measures the live selection, not the one at anchor time", () => {
    const editor = makeEditor();
    editor.commands.setTextSelection(2);
    const ref = createSelectionReference(editor, { rect: null });
    const measured: number[] = [];
    const real = editor.view.coordsAtPos.bind(editor.view);
    editor.view.coordsAtPos = (pos: number, side?: number) => {
      measured.push(pos);
      return real(pos, side);
    };

    editor.commands.setTextSelection(10);
    ref.getBoundingClientRect();

    expect(measured).toEqual([10, 10]);
  });
});

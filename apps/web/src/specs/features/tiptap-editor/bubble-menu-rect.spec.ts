import { beforeEach, describe, expect, it, vi } from "vitest";

const posToDOMRect = vi.fn();
vi.mock("@tiptap/core", () => ({ posToDOMRect: (...args: unknown[]) => posToDOMRect(...args) }));

import { createSelectionReference } from "@/features/tiptap-editor/extensions/bubble-menu-rect";

function fakeEditor(from: number, to: number, size: number) {
  return {
    view: {},
    state: { selection: { from, to }, doc: { content: { size } } }
  };
}

describe("bubble menu selection reference (#2140)", () => {
  beforeEach(() => {
    posToDOMRect.mockReset();
    posToDOMRect.mockImplementation(() => new DOMRect(1, 2, 3, 4));
  });

  it("measures the live selection after the document shrinks", () => {
    const editor = fakeEditor(33, 33, 40);
    const ref = createSelectionReference(editor);

    editor.state = { selection: { from: 31, to: 31 }, doc: { content: { size: 31 } } };
    ref.getBoundingClientRect();

    expect(posToDOMRect).toHaveBeenLastCalledWith(editor.view, 31, 31);
  });

  it("clamps positions past the end of the document", () => {
    const editor = fakeEditor(33, 35, 31);
    createSelectionReference(editor).getBoundingClientRect();

    expect(posToDOMRect).toHaveBeenLastCalledWith(editor.view, 31, 31);
  });

  it("returns the last good rect instead of throwing when measuring fails", () => {
    const editor = fakeEditor(5, 8, 40);
    const ref = createSelectionReference(editor);
    const good = ref.getBoundingClientRect();

    posToDOMRect.mockImplementation(() => {
      throw new DOMException("The offset 33 is larger than the node's length (31).", "IndexSizeError");
    });

    expect(() => ref.getBoundingClientRect()).not.toThrow();
    expect(ref.getBoundingClientRect()).toBe(good);
  });

  it("returns an empty rect when the first measurement fails", () => {
    posToDOMRect.mockImplementation(() => {
      throw new DOMException("bad offset", "IndexSizeError");
    });
    const rect = createSelectionReference(fakeEditor(5, 8, 40)).getBoundingClientRect();

    expect([rect.x, rect.y, rect.width, rect.height]).toEqual([0, 0, 0, 0]);
  });
});

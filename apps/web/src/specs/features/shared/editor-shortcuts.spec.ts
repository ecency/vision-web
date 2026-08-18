import { vi } from "vitest";
import type { KeyboardEvent } from "react";

vi.mock("@/features/shared/editor-toolbar", () => ({
  detectEvent: vi.fn()
}));

import { detectEvent } from "@/features/shared/editor-toolbar";
import { handleEditorShortcut } from "@/features/shared/editor-toolbar/shortcuts";

interface KeyInit {
  key?: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

function press(init: KeyInit) {
  const preventDefault = vi.fn();
  const event = {
    key: "",
    code: "",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...init,
    preventDefault
  } as unknown as KeyboardEvent<HTMLElement>;

  return { handled: handleEditorShortcut(event), preventDefault };
}

describe("editor keyboard shortcuts", () => {
  beforeEach(() => vi.clearAllMocks());

  test("Ctrl+B asks for bold and keeps the keystroke from the browser", () => {
    // Firefox binds Ctrl+B to the bookmarks sidebar, so not preventing the
    // default means the browser eats it and nothing is emphasised.
    const { handled, preventDefault } = press({ key: "b", code: "KeyB", ctrlKey: true });

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    expect(detectEvent).toHaveBeenCalledWith("bold");
  });

  test("Cmd+B asks for bold", () => {
    press({ key: "b", code: "KeyB", metaKey: true });

    expect(detectEvent).toHaveBeenCalledWith("bold");
  });

  test("Ctrl+I asks for italic", () => {
    press({ key: "i", code: "KeyI", ctrlKey: true });

    expect(detectEvent).toHaveBeenCalledWith("italic");
  });

  test("Alt+B still asks for bold", () => {
    const { handled } = press({ key: "b", code: "KeyB", altKey: true });

    expect(handled).toBe(true);
    expect(detectEvent).toHaveBeenCalledWith("bold");
  });

  test("Alt+B on macOS asks for bold", () => {
    // Option+B produces "∫" in `key` there, which is why matching on `key`
    // alone left every Alt shortcut dead on a Mac.
    const { handled } = press({ key: "∫", code: "KeyB", altKey: true });

    expect(handled).toBe(true);
    expect(detectEvent).toHaveBeenCalledWith("bold");
  });

  test.each([
    ["t", "table"],
    ["k", "link"],
    ["c", "codeBlock"],
    ["d", "image"],
    ["m", "blockquote"]
  ])("Alt+%s asks for %s", (letter, action) => {
    press({ key: letter, code: `Key${letter.toUpperCase()}`, altKey: true });

    expect(detectEvent).toHaveBeenCalledWith(action);
  });

  test("Ctrl is only bound to bold and italic", () => {
    // The other toolbar actions stay on Alt: claiming Ctrl+K would take the
    // browser's address bar shortcut away from people.
    const { handled, preventDefault } = press({ key: "k", code: "KeyK", ctrlKey: true });

    expect(handled).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(detectEvent).not.toHaveBeenCalled();
  });

  test.each([
    ["a bare letter", { key: "b", code: "KeyB" }],
    ["Ctrl+Shift+B", { key: "B", code: "KeyB", ctrlKey: true, shiftKey: true }],
    ["Ctrl+Alt+B", { key: "b", code: "KeyB", ctrlKey: true, altKey: true }],
    ["a non-letter key", { key: "Enter", code: "Enter", ctrlKey: true }]
  ])("%s is left alone", (_label, init) => {
    const { handled, preventDefault } = press(init);

    expect(handled).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(detectEvent).not.toHaveBeenCalled();
  });
});

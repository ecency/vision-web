import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import { PublishStarterKit } from "@/features/tiptap-editor/extensions/publish-starter-kit";
import { SafeLink } from "@/features/tiptap-editor/extensions/safe-link-extension";

// TipTap 3 added link, underline, listKeymap and trailingNode to StarterKit.
// The publish editor keeps its TipTap 2 schema and output.
function createEditor(content: string) {
  return new Editor({ extensions: [PublishStarterKit, SafeLink], content });
}

describe("PublishStarterKit", () => {
  it("leaves SafeLink as the only link extension", () => {
    const editor = createEditor("<p></p>");
    try {
      const names = editor.extensionManager.extensions.map((extension) => extension.name);
      expect(names.filter((name) => name === "link")).toHaveLength(1);
      expect(editor.getHTML()).toBe("<p></p>");
      editor.commands.setContent('<p><a href="https://ecency.com">x</a></p>', { emitUpdate: false });
      expect(editor.getHTML()).toContain('class="editor-link keychainify-checked"');
    } finally {
      editor.destroy();
    }
  });

  it("has no underline or list keymap", () => {
    const editor = createEditor("<p></p>");
    try {
      expect(editor.schema.marks.underline).toBeUndefined();
      const names = editor.extensionManager.extensions.map((extension) => extension.name);
      expect(names).not.toContain("underline");
      expect(names).not.toContain("listKeymap");
    } finally {
      editor.destroy();
    }
  });

  it("does not append an empty paragraph after a trailing block", () => {
    // The trailing node plugin acts on transactions, so load through one.
    const editor = createEditor("<p></p>");
    try {
      editor.commands.setContent("<blockquote><p>quote</p></blockquote>", { emitUpdate: false });
      expect(editor.getHTML()).toBe("<blockquote><p>quote</p></blockquote>");
    } finally {
      editor.destroy();
    }
  });
});

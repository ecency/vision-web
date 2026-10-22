import { simpleMarkdownToHTML } from "@ecency/render-helper";
import { Editor } from "@tiptap/core";
import { Color } from "@tiptap/extension-text-style";
import { describe, expect, it } from "vitest";

import { PublishTextStyle } from "@/app/publish/_editor-extensions/publish-text-style";
import { PublishStarterKit } from "@/features/tiptap-editor/extensions/publish-starter-kit";
import { markdownToHtml } from "@/features/tiptap-editor/functions/markdown-to-html";

// A saved body keeps coloured text as <span class="ecency-text-color-..."
// style="color: ...">. Reloading it sanitises the style away, so the editor
// has to recognise the class alone or the colour is lost on every reload.
function reload(stored: string): string {
  const editor = new Editor({
    extensions: [PublishStarterKit, PublishTextStyle, Color],
    content: "<p></p>"
  });
  try {
    editor.commands.setContent(simpleMarkdownToHTML(stored), { emitUpdate: false });
    return editor.getHTML();
  } finally {
    editor.destroy();
  }
}

describe("publish text colour across a draft reload", () => {
  const stored = 'Hello <span class="ecency-text-color-dc2626" style="color: #dc2626">red</span> text';

  it("keeps the colour after the sanitiser strips the style", () => {
    expect(simpleMarkdownToHTML(stored)).not.toContain("style=");
    expect(reload(stored)).toContain('class="ecency-text-color-dc2626"');
  });

  it("saves the same body after a reload as when the colour was applied", () => {
    const editor = new Editor({
      extensions: [PublishStarterKit, PublishTextStyle, Color],
      content: "<p>Hello red text</p>"
    });
    try {
      editor.chain().setTextSelection({ from: 7, to: 10 }).setColor("#dc2626").run();
      const saved = markdownToHtml(editor.getHTML());
      expect(saved).toContain("ecency-text-color-dc2626");
      expect(markdownToHtml(reload(saved))).toBe(saved);
    } finally {
      editor.destroy();
    }
  });

  it("ignores spans whose class is not a text colour", () => {
    expect(reload('Hello <span class="other">plain</span> text')).not.toContain("<span");
  });
});

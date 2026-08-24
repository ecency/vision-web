import { vi } from "vitest";

vi.mock("@/features/tiptap-editor/extensions", () => ({
  HIVE_POST_PURE_REGEX: /$a^/,
  LOOM_REGEX: /$a^/,
  TAG_MENTION_PURE_REGEX: /$a^/,
  USER_MENTION_PURE_REGEX: /$a^/,
  YOUTUBE_REGEX: /$a^/
}));

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { simpleMarkdownToHTML } from "@ecency/render-helper";

import { parseAllExtensionsToDoc } from "@/features/tiptap-editor/functions/parse-all-extensions-to-doc";

function insertPastedMarkdown(markdown: string) {
  const editor = new Editor({ extensions: [StarterKit], content: "<p></p>" });
  try {
    const parsed = parseAllExtensionsToDoc(simpleMarkdownToHTML(markdown));
    editor.chain().insertContent(parsed).run();
    return editor.getHTML();
  } finally {
    editor.destroy();
  }
}

describe("blockquote paste normalization", () => {
  // Regression: pasting a bare quote marker produced <blockquote></blockquote>,
  // which ProseMirror rejects with "RangeError: Invalid content for node blockquote: <>"
  it.each([">", "> ", "hello\n\n>", ">>"])("inserts markdown %j without throwing", (markdown) => {
    expect(() => insertPastedMarkdown(markdown)).not.toThrow();
  });

  it("fills empty blockquotes with a paragraph", () => {
    expect(parseAllExtensionsToDoc("<blockquote></blockquote>")).toBe(
      "<blockquote><p></p></blockquote>"
    );
    expect(parseAllExtensionsToDoc("<blockquote>\n</blockquote>")).toBe(
      "<blockquote>\n<p></p></blockquote>"
    );
  });

  it("fills nested empty blockquotes", () => {
    expect(parseAllExtensionsToDoc("<blockquote><blockquote></blockquote></blockquote>")).toBe(
      "<blockquote><blockquote><p></p></blockquote></blockquote>"
    );
  });

  it("leaves blockquotes with bare text unchanged", () => {
    const html = "<blockquote>quoted text</blockquote>";
    expect(parseAllExtensionsToDoc(html)).toBe(html);
    expect(insertPastedMarkdown("> quoted text")).toBe(
      "<blockquote><p>quoted text</p></blockquote>"
    );
  });
});

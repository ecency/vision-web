import { vi } from "vitest";

vi.mock("@/features/tiptap-editor/extensions", () => ({
  HIVE_POST_PURE_REGEX: /$a^/,
  LOOM_REGEX: /$a^/,
  TAG_MENTION_PURE_REGEX: /$a^/,
  USER_MENTION_PURE_REGEX: /$a^/,
  YOUTUBE_REGEX:
    /^https?:\/\/(?:(?:www|m)\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[^\s]*)?/i
}));

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { simpleMarkdownToHTML } from "@ecency/render-helper";

import { parseAllExtensionsToDoc } from "@/features/tiptap-editor/functions/parse-all-extensions-to-doc";

const LIST_EXTENSIONS = [StarterKit];

/** Pastes markdown exactly as the clipboard text strategy does. */
function pasteMarkdown(markdown: string): string {
  const editor = new Editor({ extensions: LIST_EXTENSIONS, content: "<p></p>" });
  try {
    editor
      .chain()
      .insertContent(parseAllExtensionsToDoc(simpleMarkdownToHTML(markdown)))
      .run();
    return editor.getHTML();
  } finally {
    editor.destroy();
  }
}

/** Pastes raw HTML through the same parse step, for cases markdown cannot express. */
function pasteHtml(html: string): string {
  const editor = new Editor({ extensions: LIST_EXTENSIONS, content: "<p></p>" });
  try {
    editor.chain().insertContent(parseAllExtensionsToDoc(html)).run();
    return editor.getHTML();
  } finally {
    editor.destroy();
  }
}

const itemCount = (html: string): number => (html.match(/<li/g) || []).length;
const firstItem = (html: string): string =>
  html.match(/<li[^>]*>(?:(?!<\/li>).)*<\/li>/s)?.[0] ?? "";

describe("pasting a markdown list with blank items", () => {
  // Regression: a blank item renders as <li></li>, which the ProseMirror listItem
  // schema rejects with "Invalid content for node listItem: <>". insertContent
  // throws from inside the paste handler, so nothing is inserted at all and the
  // user loses the whole paste, not just the blank bullet.
  it("does not throw on a trailing blank item", () => {
    expect(() => pasteMarkdown("- one\n-")).not.toThrow();
  });

  it.each([
    ["trailing blank", "- one\n-"],
    ["blank only item", "-"],
    ["blank in the middle", "- one\n-\n- three"],
    ["two trailing blanks", "- one\n-\n-"],
    ["ordered list", "1. one\n2."],
    ["asterisk list", "* one\n*"],
    ["trailing marker with a space", "- one\n- "]
  ])("survives a %s", (_label: string, markdown: string) => {
    const html = pasteMarkdown(markdown);

    expect(html).toContain("<li");
    expect(itemCount(html)).toBe(markdown.split("\n").length);
  });

  it("preserves the content of the items that are not blank", () => {
    const html = pasteMarkdown("- kept one\n-\n- kept two");

    expect(html).toContain("kept one");
    expect(html).toContain("kept two");
  });

  it("fills a blank item with an empty paragraph rather than dropping it", () => {
    const doc = parseAllExtensionsToDoc("<ul><li>one</li><li></li></ul>");

    expect(doc).toContain("<li><p></p></li>");
  });

  // Regression: the blank guard also matches items holding only whitespace or
  // &nbsp;, which the browser already renders as one paragraph. Appending to
  // those left the invisible text plus an empty paragraph, doubling the item
  // height. They must be replaced, not appended to.
  it.each([
    ["a non-breaking space", "&nbsp;"],
    ["plain spaces", "   "],
    ["a tab", "\t"],
    ["mixed invisible content", " &nbsp; "],
    ["an empty inline wrapper", "<span></span>"]
  ])(
    "normalises an item holding only %s to a single empty paragraph",
    (_label: string, filler: string) => {
      const doc = parseAllExtensionsToDoc(`<ul><li>one</li><li>${filler}</li></ul>`);

      expect(doc).toContain("<li><p></p></li>");
      expect(doc).not.toContain("&nbsp;<p>");
    }
  );

  it("renders a visually blank item as exactly one paragraph in the editor", () => {
    const html = pasteHtml("<ul><li>one</li><li>&nbsp;</li></ul>");
    const lastItem = html.match(/<li[^>]*>(?:(?!<\/li>).)*<\/li>\s*<\/ul>/s)?.[0] ?? "";

    expect((lastItem.match(/<p>/g) || []).length).toBe(1);
  });

  it("leaves an item with real content alone", () => {
    const doc = parseAllExtensionsToDoc("<ul><li>one</li><li>kept</li></ul>");

    expect(doc).toContain("kept");
    expect(doc).not.toContain("<li><p></p></li>");
  });
});

describe("pasting a markdown list whose item starts with a block", () => {
  // Same schema rule, other half: listItem is "paragraph block*", so the FIRST
  // child has to be a paragraph. Every one of these threw the same RangeError
  // from the same line and lost the whole paste.
  it.each([
    ["heading", "- # head", "head"],
    ["setext heading from a stray marker", "- one\n  -", "one"],
    ["blockquote", "- > quoted", "quoted"],
    ["code fence", "- ```\n  code\n  ```", "code"],
    ["horizontal rule", "- ***", "<hr"],
    ["nested list with no lead-in", "-\n  - nested", "nested"]
  ])("survives an item starting with a %s", (_label: string, markdown: string, kept: string) => {
    let html = "";

    expect(() => (html = pasteMarkdown(markdown))).not.toThrow();
    expect(html).toContain("<li");
    expect(html).toContain(kept);
  });

  it("keeps an embed that replaced a bare video link as the only item", () => {
    const doc = parseAllExtensionsToDoc(
      '<ul><li><a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">https://www.youtube.com/watch?v=dQw4w9WgXcQ</a></li></ul>'
    );

    expect(doc).toContain("<li><p></p><div data-youtube-video");
  });

  // The paragraph is only needed when the block LEADS the item. Text before it
  // already becomes the required paragraph, so prepending another one there just
  // put a blank line under every parent bullet of a nested list.
  it("does not add a blank line when text already leads the item", () => {
    const html = pasteHtml("<ul><li>one<ul><li>x</li></ul></li></ul>");

    expect(html).not.toContain("<p></p>");
    expect(html).toContain("one");
    expect(html).toContain("x");
  });

  it.each([
    ["a link", "- [text](https://example.com)"],
    ["bold text", "- **bold**"],
    ["plain text", "- plain"]
  ])("leaves an ordinary item starting with %s alone", (_label: string, markdown: string) => {
    const html = pasteMarkdown(markdown);

    expect((firstItem(html).match(/<p>/g) || []).length).toBe(1);
    expect(html).not.toContain("<li><p></p>");
  });
});

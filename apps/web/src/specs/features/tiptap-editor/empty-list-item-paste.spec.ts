import { vi } from "vitest";

// Only the hive-post pass needs stubbing here: it is the one that reads
// `el.innerText`, which jsdom does not implement, and it calls `.trim()` on it
// unguarded, so a hive-post-shaped href throws in a spec instead of exercising
// anything. Everything else, including the YouTube and Loom passes, runs for
// real. Same re-mock pattern CLAUDE.md documents for `@/utils`.
vi.mock("@/features/tiptap-editor/extensions", async () => ({
  ...(await vi.importActual("@/features/tiptap-editor/extensions")),
  HIVE_POST_PURE_REGEX: /$a^/
}));

import { Editor } from "@tiptap/core";
import { simpleMarkdownToHTML } from "@ecency/render-helper";

import { parseAllExtensionsToDoc } from "@/features/tiptap-editor/functions/parse-all-extensions-to-doc";
import { PUBLISH_EDITOR_EXTENSIONS } from "./publish-editor-extensions";

// Must mirror the publish editor for the nodes under test. StarterKit alone has
// no image node, which would make a perfectly renderable image look like a crash.
const LIST_EXTENSIONS = PUBLISH_EDITOR_EXTENSIONS;

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
    ["an empty inline wrapper", "<span></span>"],
    // These have no node in this editor, so they render as nothing. Treating
    // them as content left the item schema-empty and lost the whole paste.
    ["an audio element", '<audio src="x"></audio>'],
    ["a video element", '<video src="x"></video>'],
    ["an iframe", '<iframe src="x"></iframe>']
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

  // A src-less <img> is the same false-keeper trap as audio/video/iframe: the
  // render-helper sanitiser blanks src on every non-https image, and the Image
  // node only parses img[src]:not([src^="data:"]), so the item renders as nothing.
  it.each([
    ["a relative path", "- ![a](./logo.png)"],
    ["a root-relative path", "- ![a](/logo.png)"],
    ["an ipfs url", "- ![a](ipfs://QmXyz)"],
    ["a linked banner", "- [![a](./x.png)](https://b.com)"]
  ])("survives an item whose only image has %s", (_label: string, markdown: string) => {
    expect(() => pasteMarkdown(markdown)).not.toThrow();
  });

  it("keeps an image the editor can actually render", () => {
    const html = pasteMarkdown("- ![a](https://images.test/a.png)");

    expect(html).toContain("https://images.test/a.png");
  });

  it("blanks an item holding only a data-uri image, which the editor does not parse", () => {
    const doc = parseAllExtensionsToDoc(
      '<ul><li>one</li><li><img src="data:image/png;base64,iVBOR"></li></ul>'
    );

    expect(doc).toContain("<li><p></p></li>");
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

  it.each([
    ["an audio element", "- <audio src=x>"],
    ["a closed audio element", "- <audio src=x></audio>"]
  ])("survives an item holding only %s", (_label: string, markdown: string) => {
    expect(() => pasteMarkdown(markdown)).not.toThrow();
  });

  it("recognises a block hiding behind a wrapper the schema drops", () => {
    const doc = parseAllExtensionsToDoc(
      '<ul><li><span></span><a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">v</a></li></ul>'
    );

    expect(doc).toContain("<p></p><div data-youtube-video");
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

  // Regression: the walk past dropped wrappers must not step over a <p>, which
  // already satisfies the leading-paragraph rule. Skipping it added a second,
  // redundant empty paragraph under items whose lead-in is an image.
  it("does not add a paragraph when one already leads the item", () => {
    const doc = parseAllExtensionsToDoc(
      '<ul><li><p><img src="https://images.test/a.png"></p><ul><li>x</li></ul></li></ul>'
    );

    expect(doc).not.toContain("<p></p>");
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

// The same "renders as nothing" rule governs the two sibling repairs in this
// file. Both used to test only whether an element child existed, so a container
// holding one the schema drops stayed schema-empty and lost the whole paste.
describe("pasting blockquotes and table cells that render as nothing", () => {
  it.each([
    ["an iframe", "> <iframe src=https://a></iframe>"],
    ["a video", "> <video src=https://a/b.mp4 controls></video>"],
    ["an audio element", "> <audio src=https://a/b.mp3 controls></audio>"]
  ])("survives a blockquote holding only %s", (_label: string, markdown: string) => {
    expect(() => pasteMarkdown(markdown)).not.toThrow();
  });

  it("still leaves a blockquote holding a nested blockquote alone", () => {
    expect(parseAllExtensionsToDoc("<blockquote><blockquote></blockquote></blockquote>")).toBe(
      "<blockquote><blockquote><p></p></blockquote></blockquote>"
    );
  });

  it.each([
    ["an image the editor cannot render", "| a |\n| --- |\n| ![x](./y.png) |"],
    ["an empty inline wrapper", '| a | b |\n| - | - |\n| c | <span class="x"></span> |']
  ])("survives a table cell holding only %s", (_label: string, markdown: string) => {
    expect(() => pasteMarkdown(markdown)).not.toThrow();
  });

  it("keeps a cell image the editor can render", () => {
    const doc = parseAllExtensionsToDoc(
      '<table><tbody><tr><td><img src="https://images.test/a.png"></td></tr></tbody></table>'
    );

    expect(doc).toContain("https://images.test/a.png");
  });
});

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

const EXTENSIONS = PUBLISH_EDITOR_EXTENSIONS;

function insert(html: string): string {
  const editor = new Editor({ extensions: EXTENSIONS, content: "<p></p>" });
  try {
    editor.chain().insertContent(parseAllExtensionsToDoc(html)).run();
    return editor.getHTML();
  } finally {
    editor.destroy();
  }
}

const pasteMarkdown = (markdown: string) => insert(simpleMarkdownToHTML(markdown));

// Regression: bulletList and orderedList are "listItem+" and table is "tableRow+",
// so a container holding none is schema-invalid. insertContent throws from inside
// the paste handler, so the user loses the entire clipboard rather than just the
// empty container.
describe("pasting an empty list or a rowless table", () => {
  it.each([
    ["an empty bullet list", "<ul></ul>"],
    ["an empty ordered list", "<ol></ol>"],
    ["a list holding only whitespace", "<ul>   </ul>"],
    ["an empty list inside an item", "<ul><li>a</li><li><ul></ul></li></ul>"],
    ["a list whose only child is a list", "<ul><ul><li>x</li></ul></ul>"],
    ["an empty table", "<table></table>"],
    ["a table with an empty body", "<table><tbody></tbody></table>"]
  ])("survives %s", (_label: string, html: string) => {
    expect(() => insert(html)).not.toThrow();
  });

  it("survives an unfenced table snippet, which the paste guard does not divert", () => {
    // The guard is /<[a-z]+>.*<\/[a-z]+>/gim with no s flag, so an open and close
    // tag on separate lines travels the markdown path into this function.
    expect(() => pasteMarkdown("Use the table tag:\n\n<table>\n</table>")).not.toThrow();
  });

  it("keeps the rest of the paste when an empty list is in it", () => {
    const html = insert("<p>before</p><ul></ul><p>after</p>");

    expect(html).toContain("before");
    expect(html).toContain("after");
  });

  it("keeps a nested list that was its parent's only child", () => {
    expect(insert("<ul><ul><li>x</li></ul></ul>")).toContain("x");
  });

  it("leaves an item empty by removal with a paragraph, not a broken bullet", () => {
    const html = "<ul><li>a</li><li><ul></ul></li></ul>";

    expect(parseAllExtensionsToDoc(html)).toContain("<li><p></p></li>");
    expect(insert(html)).toBe("<ul><li><p>a</p></li><li><p></p></li></ul>");
  });

  it.each([
    ["a real list", "- one\n- two", "one"],
    ["a real table", "| a |\n| --- |\n| 1 |", "<table"]
  ])("leaves %s alone", (_label: string, markdown: string, kept: string) => {
    expect(pasteMarkdown(markdown)).toContain(kept);
  });

  // Review: unwrapping used to carry whitespace-only text out of the container,
  // which the editor then rendered as a blank paragraph.
  it.each([
    ["spaces", "<p>a</p><ul>   </ul><p>b</p>"],
    ["a newline", "<p>a</p><ul>\n</ul><p>b</p>"]
  ])(
    "does not leave a blank paragraph behind for a list holding only %s",
    (_l: string, html: string) => {
      expect(parseAllExtensionsToDoc(html)).toBe(html.replace(/<ul>[\s]*<\/ul>/, ""));
      expect(insert(html)).toBe("<p>a</p><p>b</p>");
    }
  );

  // Review: a rowless table can still carry a caption, and that text is the
  // author's, so unwrap rather than drop. Assert the editor's own output, not the
  // intermediate HTML: keeping the <caption> wrapper also "contains" the text,
  // while the editor renders the tag itself as escaped literal markup.
  it("keeps the caption text of a rowless table as text", () => {
    const html = insert("<table><caption>Quarterly totals</caption></table>");

    expect(html).toContain("Quarterly totals");
    expect(html).not.toContain("&lt;");
  });

  it.each([
    ["an empty body", "<table><tbody></tbody></table>"],
    ["an empty head and body", "<table><thead></thead><tbody></tbody></table>"],
    ["a column group", "<table><colgroup><col></colgroup></table>"],
    ["a caption beside an empty body", "<table><caption>Totals</caption><tbody></tbody></table>"]
  ])("does not leak the wrappers of a rowless table holding %s", (_l: string, html: string) => {
    const rendered = insert(html);

    // Not a tag-name proxy: caption TEXT may legitimately contain those words.
    // What must never appear is escaped markup, which is how tiptap surfaces a
    // paste that parses to nothing.
    expect(rendered).not.toContain("&lt;");
    expect(rendered).not.toContain("&gt;");
  });

  // Regression: flattening a caption to bare text put the whole paste on tiptap's
  // isOnlyTextContent branch, which calls tr.insertText with the RAW HTML string,
  // so an entity in the caption reached the document double-escaped.
  it.each([
    ["an ampersand", "<table><caption>A &amp; B</caption></table>", "A &amp; B"],
    ["a less-than", "<table><caption>1 &lt; 2</caption></table>", "1 &lt; 2"]
  ])("keeps caption text containing %s intact", (_l: string, html: string, expected: string) => {
    expect(insert(html)).toBe(`<p>${expected}</p>`);
  });

  it("keeps an image held in the caption of a rowless table", () => {
    const rendered = insert(
      '<table><caption><img src="https://images.test/a.png"></caption></table>'
    );

    expect(rendered).toContain("https://images.test/a.png");
    expect(rendered).not.toContain("&lt;");
  });

  it("keeps a nested table whose outer table has no row of its own", () => {
    const html =
      "<table><caption><table><tbody><tr><td>x</td></tr></tbody></table></caption></table>";

    expect(() => insert(html)).not.toThrow();
    expect(insert(html)).toContain("x");
    expect(insert(html)).not.toContain("&lt;");
  });

  it("keeps a list whose only item is empty", () => {
    expect(parseAllExtensionsToDoc("<ul><li></li></ul>")).toBe("<ul><li><p></p></li></ul>");
  });
});

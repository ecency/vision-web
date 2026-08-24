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
import Image from "@tiptap/extension-image";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import { simpleMarkdownToHTML } from "@ecency/render-helper";

import { parseAllExtensionsToDoc } from "@/features/tiptap-editor/functions/parse-all-extensions-to-doc";

const EXTENSIONS = [
  StarterKit,
  Image.configure({ inline: true }),
  Table,
  TableRow,
  TableCell,
  TableHeader
];

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
    const doc = parseAllExtensionsToDoc("<ul><li>a</li><li><ul></ul></li></ul>");

    expect(doc).toContain("<li><p></p></li>");
  });

  it.each([
    ["a real list", "- one\n- two", "one"],
    ["a real table", "| a |\n| --- |\n| 1 |", "<table"]
  ])("leaves %s alone", (_label: string, markdown: string, kept: string) => {
    expect(pasteMarkdown(markdown)).toContain(kept);
  });

  it("keeps a list whose only item is empty", () => {
    expect(parseAllExtensionsToDoc("<ul><li></li></ul>")).toBe("<ul><li><p></p></li></ul>");
  });
});

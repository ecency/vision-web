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
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import { simpleMarkdownToHTML } from "@ecency/render-helper";

import { parseAllExtensionsToDoc } from "@/features/tiptap-editor/functions/parse-all-extensions-to-doc";

const TABLE_EXTENSIONS = [StarterKit, Table, TableRow, TableCell, TableHeader];

/** Pastes markdown exactly as the clipboard text strategy does. */
function pasteMarkdown(markdown: string): string {
  const editor = new Editor({ extensions: TABLE_EXTENSIONS, content: "<p></p>" });
  try {
    editor.chain().insertContent(parseAllExtensionsToDoc(simpleMarkdownToHTML(markdown))).run();
    return editor.getHTML();
  } finally {
    editor.destroy();
  }
}

const rowCount = (html: string) => (html.match(/<tr/g) || []).length;

describe("pasting a markdown table with blank cells", () => {
  // Regression: a blank cell renders as <td></td>, which the ProseMirror
  // tableCell schema rejects with "Invalid content for node tableCell: <>".
  // insertContent throws, so nothing is inserted and the table never appears.
  // One blank cell anywhere was enough to lose the whole table.
  it("does not throw on a trailing blank cell", () => {
    expect(() => pasteMarkdown("| A | B |\n| --- | --- |\n| 1 |  |")).not.toThrow();
  });

  it("keeps every row when a cell is blank", () => {
    expect(rowCount(pasteMarkdown("| A | B |\n| --- | --- |\n| 1 |  |"))).toBe(2);
  });

  it.each([
    ["trailing blank", "| A | B |\n| --- | --- |\n| 1 |  |"],
    ["leading blank", "| A | B |\n| --- | --- |\n|  | 2 |"],
    ["middle blank", "| A | B | C |\n| --- | --- | --- |\n| 1 |  | 3 |"],
    ["whole row blank", "| A | B |\n| --- | --- |\n|  |  |"],
    ["blank header cell", "| A |  |\n| --- | --- |\n| 1 | 2 |"],
    ["several blank rows", "| A | B |\n| --- | --- |\n| 1 |  |\n|  | 4 |\n|  |  |"]
  ])("survives a %s", (_label, markdown) => {
    const html = pasteMarkdown(markdown);
    expect(html).toContain("<table");
    expect(rowCount(html)).toBe(markdown.split("\n").length - 1);
  });

  it("preserves the content of the cells that are not blank", () => {
    const html = pasteMarkdown("| Date | Memo |\n| --- | --- |\n| 2019-02-11 |  |\n| 2023-01-06 | closed off |");

    expect(html).toContain("2019-02-11");
    expect(html).toContain("2023-01-06");
    expect(html).toContain("closed off");
  });

  it("still pastes a table with no blank cells at all", () => {
    const html = pasteMarkdown("| A | B |\n| --- | --- |\n| 1 | 2 |");

    expect(rowCount(html)).toBe(2);
    expect(html).toContain("1");
    expect(html).toContain("2");
  });

  it("fills a blank cell with an empty paragraph rather than dropping it", () => {
    const doc = parseAllExtensionsToDoc("<table><tbody><tr><td>1</td><td></td></tr></tbody></table>");

    expect(doc).toContain("<td><p></p></td>");
  });
});

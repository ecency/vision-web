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

import { markdownToHtml } from "@/features/tiptap-editor/functions/markdown-to-html";
import { parseAllExtensionsToDoc } from "@/features/tiptap-editor/functions/parse-all-extensions-to-doc";

const TABLE_MARKDOWN = [
  "| Date | Account | Amount |",
  "| --- | --- | --- |",
  "| 2023-01-06 | valueplan | 52,239.55 |",
  "| 2020-04-03 | ecency | 941.94 |"
].join("\n");

/**
 * Mirrors what the publish editor actually does: paste plain text (converted by
 * the clipboard strategy), then serialize the document back to markdown the way
 * `use-publish-editor` does on every update.
 */
function pasteThenSerialize(markdown: string) {
  const editor = new Editor({
    extensions: [StarterKit, Table, TableRow, TableCell, TableHeader],
    content: "<p></p>"
  });
  try {
    editor.chain().insertContent(parseAllExtensionsToDoc(simpleMarkdownToHTML(markdown))).run();
    return markdownToHtml(editor.getHTML());
  } finally {
    editor.destroy();
  }
}

describe("markdown table round-trip through the publish editor", () => {
  // Regression: Turndown was built with only the `strikethrough` GFM plugin, so
  // it had no rule for <table> and flattened every pasted table into loose text
  // on the first serialization pass.
  it("keeps a pasted table a table", () => {
    const result = pasteThenSerialize(TABLE_MARKDOWN);

    expect(result).toContain("| Date | Account | Amount |");
    expect(result).toContain("| 2023-01-06 | valueplan | 52,239.55 |");
    expect(result).toContain("| 2020-04-03 | ecency | 941.94 |");
  });

  it("keeps every row on its own line with a delimiter row", () => {
    const lines = pasteThenSerialize(TABLE_MARKDOWN)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("|"));

    // header + delimiter + 2 body rows
    expect(lines).toHaveLength(4);
    expect(lines[1]).toMatch(/^\|[\s-|:]+\|$/);
    lines.forEach((line) => expect(line.split("|")).toHaveLength(5));
  });

  // Regression: TipTap emits <colgroup> before <tbody> and keeps the header
  // cells as <th> inside that <tbody>, which made the GFM rule miss the heading
  // row and prepend an empty one ("|  |  |  |") above the real headers.
  it("uses the real header row rather than prepending an empty one", () => {
    const lines = pasteThenSerialize(TABLE_MARKDOWN)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("|"));

    expect(lines[0]).toContain("Date");
    expect(lines[0]).toContain("Account");
    expect(lines[0]).not.toMatch(/^\|(\s*\|)+$/);
  });

  it("does not flatten cells into loose paragraphs", () => {
    const result = pasteThenSerialize(TABLE_MARKDOWN);

    // the pre-fix output was "Date\n\nAccount\n\nAmount\n\n2023-01-06\n\n..."
    expect(result).not.toMatch(/^Date\s*$/m);
    expect(result).not.toMatch(/^valueplan\s*$/m);
  });

  it("serializes a table built with the editor's own insertTable command", () => {
    const editor = new Editor({
      extensions: [StarterKit, Table, TableRow, TableCell, TableHeader],
      content: "<p></p>"
    });
    try {
      editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
      expect(markdownToHtml(editor.getHTML())).toMatch(/\|.*\|/);
    } finally {
      editor.destroy();
    }
  });
});

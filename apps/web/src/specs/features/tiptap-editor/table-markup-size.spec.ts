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

import { markdownToHtml } from "@/features/tiptap-editor/functions/markdown-to-html";

const TABLE_EXTENSIONS = [StarterKit, Table, TableRow, TableCell, TableHeader];

/** Serializes raw editor HTML exactly as `use-publish-editor` does on update. */
const serialize = (html: string): string => {
  const editor = new Editor({ extensions: TABLE_EXTENSIONS, content: html });
  try {
    return markdownToHtml(editor.getHTML());
  } finally {
    editor.destroy();
  }
};

/** Serializes without going through the editor, for cases it would normalise away. */
const serializeRaw = (html: string): string => markdownToHtml(html);

describe("table markup size", () => {
  // The chain prices a comment mostly on history_bytes, which is the
  // serialized transaction size, so wrapper bytes are a direct cost to the
  // author. A 46,620-byte post was rejected for insufficient RC; ~29KB of it
  // was span attributes and paragraph wrappers carrying no information.
  it("drops colspan and rowspan of 1", () => {
    const result = serialize("<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>");

    expect(result).not.toContain('colspan="1"');
    expect(result).not.toContain('rowspan="1"');
  });

  it("keeps spans that actually span", () => {
    const result = serializeRaw(
      '<table><tbody><tr><td colspan="2" rowspan="3">merged</td></tr></tbody></table>'
    );

    expect(result).toContain('colspan="2"');
    expect(result).toContain('rowspan="3"');
  });

  it("unwraps a cell whose only child is a plain paragraph", () => {
    const result = serializeRaw("<table><tbody><tr><td><p>value</p></td></tr></tbody></table>");

    expect(result).toContain("<td>value</td>");
  });

  it("keeps inline formatting when unwrapping", () => {
    const result = serializeRaw(
      "<table><tbody><tr><td><p>a <strong>bold</strong> word</p></td></tr></tbody></table>"
    );

    expect(result).toContain("<strong>bold</strong>");
    expect(result).toContain("<td>a <strong>bold</strong> word</td>");
  });

  it("keeps the paragraph when it carries alignment", () => {
    const result = serializeRaw(
      '<table><tbody><tr><td><p style="text-align: right">7</p></td></tr></tbody></table>'
    );

    expect(result).toContain("text-align");
    expect(result).toContain("<p");
  });

  it("keeps structure in a multi-paragraph cell", () => {
    const result = serializeRaw(
      "<table><tbody><tr><td><p>one</p><p>two</p></td></tr></tbody></table>"
    );

    expect(result).toContain("<p>one</p>");
    expect(result).toContain("<p>two</p>");
  });

  it("keeps structure in a cell holding a list", () => {
    const result = serializeRaw(
      "<table><tbody><tr><td><ul><li>a</li><li>b</li></ul></td></tr></tbody></table>"
    );

    expect(result).toContain("<ul>");
    expect(result).toContain("<li>a</li>");
  });

  it("keeps the paragraph when the cell holds an inline image", () => {
    // `.markdown-view p img` sets display:inline-block to keep an image aligned
    // with the text around it. Promoting the image to a bare cell child loses
    // that and can break "before <img> after" across lines.
    const result = serializeRaw(
      '<table><tbody><tr><td><p>before <img src="https://x/a.png" alt="" /> after</p></td></tr></tbody></table>'
    );

    expect(result).toContain("<p>");
    expect(result).toContain("<img");
    expect(result).not.toContain("<td><img");
  });

  it("keeps the paragraph for an image-only cell too", () => {
    const result = serializeRaw(
      '<table><tbody><tr><td><p><img src="https://x/a.png" alt="" /></p></td></tr></tbody></table>'
    );

    expect(result).toContain("<p><img");
  });

  it("still unwraps a text cell that merely mentions an image in words", () => {
    const result = serializeRaw(
      "<table><tbody><tr><td><p>see the image below</p></td></tr></tbody></table>"
    );

    expect(result).toContain("<td>see the image below</td>");
  });

  it("keeps a nested table intact", () => {
    const result = serializeRaw(
      "<table><tbody><tr><td><table><tbody><tr><td><p>inner</p></td></tr></tbody></table></td></tr></tbody></table>"
    );

    expect(result).toContain("inner");
    expect((result.match(/<table/g) || []).length).toBe(2);
  });

  it("leaves an empty cell empty, which the paste path refills on load", () => {
    const result = serializeRaw("<table><tbody><tr><td><p></p></td></tr></tbody></table>");

    expect(result).toContain("<td></td>");
  });

  it("measurably shrinks a realistic table", () => {
    const rows = Array.from(
      { length: 40 },
      (_, i) =>
        "<tr>" +
        Array.from(
          { length: 10 },
          (_, c) => `<td colspan="1" rowspan="1"><p>${i}-${c}</p></td>`
        ).join("") +
        "</tr>"
    ).join("");
    const before = `<table><tbody>${rows}</tbody></table>`;
    const after = serializeRaw(before);

    expect(after.length).toBeLessThan(before.length * 0.55);
    // every value survives
    expect(after).toContain("39-9");
    expect(after).toContain("0-0");
  });
});

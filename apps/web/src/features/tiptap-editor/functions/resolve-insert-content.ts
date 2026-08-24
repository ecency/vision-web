import { createNodeFromContent } from "@tiptap/core";
import { Schema } from "@tiptap/pm/model";

/** A plain-text node, the one shape insertContent inserts verbatim. */
interface TextContent {
  type: "text";
  text: string;
}

/**
 * Decides what to hand `insertContent` so that content the schema renders as
 * nothing does not come back as literal markup.
 *
 * ⛔ Never pass normalised HTML to `insertContent` directly. When the parsed
 * result is EMPTY, tiptap's `insertContentAt` leaves its `isOnlyTextContent`
 * flag true (the forEach over the nodes runs zero times) and falls through to
 * `tr.insertText(value)` with the HTML STRING, so pasting say
 * `<iframe src=...></iframe>` puts `&lt;iframe src=...&gt;` in the document as
 * visible text. The same branch double-escapes when the parse is text alone:
 * `A &amp; B` arrives as those literal characters rather than `A & B`.
 * See @tiptap/core 2.26.2 dist/index.js, insertContentAt.
 *
 * @param schema the editor's schema, which decides what renders at all
 * @param html normalised HTML, straight from parseAllExtensionsToDoc
 * @param fallbackText what the user actually had, used when nothing renders
 * @returns the value for insertContent, or null when there is nothing to insert
 */
export function resolveInsertContent(
  schema: Schema,
  html: string,
  fallbackText?: string
): string | TextContent | null {
  const content = createNodeFromContent(html, schema, {
    parseOptions: { preserveWhitespace: "full" }
  });

  let text = "";
  let isOnlyText = content.childCount > 0;

  content.forEach((node) => {
    isOnlyText = isOnlyText && node.isText && node.marks.length === 0;
    text += node.text ?? "";
  });

  // Renders as nothing. Show what the user actually had rather than our
  // intermediate HTML, so nothing is silently dropped and nothing is invented.
  if (content.childCount === 0) {
    return fallbackText?.length ? { type: "text", text: fallbackText } : null;
  }

  // Text alone: insert the parsed text, not the HTML that encoded it.
  if (isOnlyText) {
    return text.length ? { type: "text", text } : null;
  }

  return html;
}

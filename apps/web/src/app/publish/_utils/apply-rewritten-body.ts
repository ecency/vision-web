import { parseAllExtensionsToDoc } from "@/features/tiptap-editor";
import { simpleMarkdownToHTML } from "@ecency/render-helper";
import type { Editor } from "@tiptap/core";

/**
 * Replaces the editor body with rewritten markdown, for example an AI assist
 * result. The update is emitted so the draft, and what gets published, holds
 * the new body right away instead of only after the next keystroke.
 */
export function applyRewrittenBody(editor: Editor | null | undefined, markdown: string): void {
  const doc = parseAllExtensionsToDoc(simpleMarkdownToHTML(markdown));
  editor?.commands.setContent(doc, { emitUpdate: true });
}

import { Editor } from "@tiptap/core";
import { ClipboardStrategy } from "./clipboard-strategy";
import { parseAllExtensionsToDoc, resolveInsertContent } from "../../functions";
import { simpleMarkdownToHTML } from "@ecency/render-helper";

export class ClipboardPluginTextStrategy implements ClipboardStrategy {
  private editor: Editor | null = null;
  private onHtmlPaste: () => void;

  constructor(onHtmlPaste: () => void) {
    this.onHtmlPaste = onHtmlPaste;
  }

  handle(event: ClipboardEvent): boolean | void {
    const pastedText = event.clipboardData?.getData("text/plain");
    if (pastedText) {
      if (/<[a-z]+>.*<\/[a-z]+>/gim.test(pastedText)) {
        this.onHtmlPaste();
      } else {
        const parsedText = parseAllExtensionsToDoc(simpleMarkdownToHTML(pastedText));
        // Falls back to the clipboard text when nothing in the paste renders, so
        // the editor never shows our intermediate HTML as literal markup.
        const content = this.editor
          ? resolveInsertContent(this.editor.schema, parsedText, pastedText)
          : null;

        if (content) {
          this.editor?.chain().insertContent(content).run();
        }
      }

      event.preventDefault();
      return true;
    }
  }

  withEditor(editor: Editor | null) {
    this.editor = editor;
    return this;
  }
}

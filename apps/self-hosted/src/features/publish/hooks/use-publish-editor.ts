import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TextAlign from "@tiptap/extension-text-align";
import { useCallback, useEffect } from "react";
import { LINK_EXTENSION } from "../utils/editor-extensions";
import { htmlToMarkdown, markdownToHtml } from "../utils/markdown";
import { usePublishState } from "./use-publish-state";

export function usePublishEditor() {
  const publishState = usePublishState();

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit,
      LINK_EXTENSION,
      Placeholder.configure({
        placeholder: "Start writing..."
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"]
      }),
      Table.configure({
        resizable: true
      }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({
        inline: true
      })
    ],
    onUpdate({ editor }) {
      // Convert HTML to markdown and save to state
      const html = editor.getHTML();
      const markdown = htmlToMarkdown(html);
      publishState.setContentState(markdown);
    }
  });

  const setEditorContent = useCallback(
    (content: string | undefined) => {
      if (!editor) return;

      try {
        if (!content || content.trim() === "") {
          editor.commands.setContent("");
          return;
        }

        // Convert markdown to HTML and load into editor
        const html = markdownToHtml(content);
        editor.commands.setContent(html);
      } catch (error) {
        console.error("Failed to load content into editor:", error);
        editor.commands.setContent("");
      }
    },
    [editor]
  );

  // Load content from state when editor is ready
  useEffect(() => {
    if (editor && publishState.content) {
      setEditorContent(publishState.content);
    }
  }, [editor]); // Only on mount

  // Handle editor clearing when content is cleared
  useEffect(() => {
    if (!publishState.content && editor?.getText() !== "") {
      editor?.commands.setContent("");
    }
  }, [editor, publishState.content]);

  return { editor, setEditorContent };
}

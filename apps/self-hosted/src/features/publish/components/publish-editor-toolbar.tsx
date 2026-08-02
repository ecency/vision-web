import { Editor } from "@tiptap/react";
import {
  UilBold,
  UilItalic,
  UilTextStrikeThrough,
  UilListUl,
  UilListOl,
  UilTextSize,
  UilTable,
  UilAlignLeft,
  UilAlignCenter,
  UilAlignRight,
  UilBracketsCurly,
  UilParagraph,
  UilLink,
  UilLinkBroken,
} from "@tooni/iconscout-unicons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/core";
import { PublishEditorTableToolbar } from "./publish-editor-table-toolbar";

interface Props {
  editor: Editor | null;
}

const headings = [1, 2, 3, 4, 5, 6] as const;

export function PublishEditorToolbar({ editor }: Props) {
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const [isFocusingTable, setIsFocusingTable] = useState(false);
  const headingMenuRef = useRef<HTMLDivElement>(null);

  // Close heading menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        headingMenuRef.current &&
        !headingMenuRef.current.contains(event.target as Node)
      ) {
        setShowHeadingMenu(false);
      }
    };

    if (showHeadingMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showHeadingMenu]);

  // Track table focus
  useEffect(() => {
    if (!editor) {
      return;
    }

    const handleSelectionUpdate = () => {
      setIsFocusingTable(editor.isActive("table"));
    };

    const handleBlur = () => {
      setIsFocusingTable(false);
    };

    editor.on("selectionUpdate", handleSelectionUpdate);
    editor.on("blur", handleBlur);

    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate);
      editor.off("blur", handleBlur);
    };
  }, [editor]);

  const setLink = useCallback(() => {
    if (!editor) return;

    const previous = editor.getAttributes("link").href as string | undefined;
    const input = window.prompt(t("editor_link_prompt"), previous ?? "https://");
    // Cancelling returns null; an empty string is an explicit "remove the link".
    if (input === null) return;

    const href = input.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }, [editor]);

  const insertTable = useCallback(() => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertTable({ rows: 2, cols: 2, withHeaderRow: true })
      .run();
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <>
    <div className="flex flex-wrap items-center gap-1 p-2">
      {/* Text alignment */}
      <button
        type="button"
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
          editor.isActive({ textAlign: "left" })
            ? "bg-gray-200 dark:bg-gray-600"
            : ""
        }`}
        title="Align left"
      >
        <UilAlignLeft className="size-5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
          editor.isActive({ textAlign: "center" })
            ? "bg-gray-200 dark:bg-gray-600"
            : ""
        }`}
        title="Align center"
      >
        <UilAlignCenter className="size-5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
          editor.isActive({ textAlign: "right" })
            ? "bg-gray-200 dark:bg-gray-600"
            : ""
        }`}
        title="Align right"
      >
        <UilAlignRight className="size-5" />
      </button>

      <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

      {/* Paragraph / Headings */}
      <div className="relative" ref={headingMenuRef}>
        <button
          type="button"
          onClick={() => setShowHeadingMenu(!showHeadingMenu)}
          className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
            editor.isActive("heading") ? "bg-gray-200 dark:bg-gray-600" : ""
          }`}
          title="Headings"
          aria-expanded={showHeadingMenu}
          aria-haspopup="menu"
        >
          <UilTextSize className="size-5" />
        </button>
        {showHeadingMenu && (
          <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-20">
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().setParagraph().run();
                setShowHeadingMenu(false);
              }}
              className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${
                editor.isActive("paragraph")
                  ? "bg-gray-100 dark:bg-gray-700"
                  : ""
              }`}
            >
              <UilParagraph className="size-4 inline mr-2" />
              Normal text
            </button>
            {headings.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => {
                  editor.chain().focus().toggleHeading({ level }).run();
                  setShowHeadingMenu(false);
                }}
                className={`w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  editor.isActive("heading", { level })
                    ? "bg-gray-100 dark:bg-gray-700"
                    : ""
                }`}
              >
                Heading {level}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

      {/* Text formatting */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
          editor.isActive("bold") ? "bg-gray-200 dark:bg-gray-600" : ""
        }`}
        title="Bold"
      >
        <UilBold className="size-5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
          editor.isActive("italic") ? "bg-gray-200 dark:bg-gray-600" : ""
        }`}
        title="Italic"
      >
        <UilItalic className="size-5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
          editor.isActive("strike") ? "bg-gray-200 dark:bg-gray-600" : ""
        }`}
        title="Strikethrough"
      >
        <UilTextStrikeThrough className="size-5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
          editor.isActive("code") ? "bg-gray-200 dark:bg-gray-600" : ""
        }`}
        title="Code"
      >
        <UilBracketsCurly className="size-5" />
      </button>

      <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

      {/* Link */}
      <button
        type="button"
        onClick={setLink}
        className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
          editor.isActive("link") ? "bg-gray-200 dark:bg-gray-600" : ""
        }`}
        title={t("editor_link")}
        aria-label={t("editor_link")}
      >
        <UilLink className="size-5" aria-hidden="true" />
      </button>
      {editor.isActive("link") && (
        <button
          type="button"
          onClick={() =>
            editor.chain().focus().extendMarkRange("link").unsetLink().run()
          }
          className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          title={t("editor_link_remove")}
          aria-label={t("editor_link_remove")}
        >
          <UilLinkBroken className="size-5" aria-hidden="true" />
        </button>
      )}

      <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

      {/* Lists */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
          editor.isActive("bulletList") ? "bg-gray-200 dark:bg-gray-600" : ""
        }`}
        title="Bullet list"
      >
        <UilListUl className="size-5" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
          editor.isActive("orderedList") ? "bg-gray-200 dark:bg-gray-600" : ""
        }`}
        title="Ordered list"
      >
        <UilListOl className="size-5" />
      </button>

      <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

      {/* Table */}
      <button
        type="button"
        onClick={insertTable}
        className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
        title="Insert table"
      >
        <UilTable className="size-5" />
      </button>
    </div>
    {isFocusingTable && <PublishEditorTableToolbar editor={editor} />}
    </>
  );
}

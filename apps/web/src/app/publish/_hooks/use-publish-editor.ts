import { error } from "@/features/shared";
import {
  HivePostExtension,
  SafeLink,
  Selection,
  TagMentionExtensionConfig,
  ThreeSpeakVideoExtension,
  YoutubeVideoExtension,
  UserMentionExtensionConfig,
  clipboardPlugin,
  DelStrike,
  markdownToHtml,
  parseAllExtensionsToDoc,
  LoomVideoExtension,
  PublishImage,
  PublishStarterKit
} from "@/features/tiptap-editor";
import Mention from "@tiptap/extension-mention";
import { Placeholder } from "@tiptap/extensions";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import { simpleMarkdownToHTML } from "@ecency/render-helper";
import { useCallback, useEffect, useRef } from "react";
import { PublishEditorImageViewer } from "../_editor-extensions";
import {
  TEXT_COLOR_CLASS_PREFIX,
  getTextColorClassName,
  getTextColorFromClassName,
  normalizeTextColor
} from "../_constants/text-colors";
import { useEditorDragDrop } from "./use-editor-drag-drop";
import { usePublishState } from "./use-publish-state";
import { usePublishLinksAttach } from "./use-publish-links-attach";
import i18next from "i18next";

// mergeNestedSpanStyles defaults to true in TipTap 3 and false in TipTap 2.
// Kept false so pasted nested spans parse exactly as before.
const PublishTextStyle = TextStyle.extend({
  addAttributes() {
    const parentAttributes = (this.parent?.() ?? {}) as Record<string, unknown>;
    const parentColor = (parentAttributes.color ?? {}) as Record<string, unknown>;

    return {
      ...parentAttributes,
      color: {
        ...parentColor,
        parseHTML: (element) => {
          const classAttribute = element.getAttribute("class");

          if (classAttribute) {
            const classes = classAttribute
              .split(/\s+/)
              .map((className) => className.trim())
              .filter(Boolean);

            for (const className of classes) {
              const parsed = getTextColorFromClassName(className);

              if (parsed) {
                return parsed;
              }
            }
          }

          const inlineColor = element.style.color || element.getAttribute("color");

          const normalizedInlineColor = normalizeTextColor(inlineColor);
          if (normalizedInlineColor) {
            return normalizedInlineColor;
          }

          const parentParseHTML =
            typeof (parentColor as { parseHTML?: unknown }).parseHTML === "function"
              ? (parentColor as { parseHTML: (element: HTMLElement) => unknown }).parseHTML
              : null;

          if (parentParseHTML) {
            const parsed = parentParseHTML(element);

            if (typeof parsed === "string") {
              const normalized = normalizeTextColor(parsed);

              if (normalized) {
                return normalized;
              }
            }
          }

          return null;
        },
        renderHTML: (attributes) => {
          const {
            color,
            class: className,
            style,
            ...otherAttributes
          } = (attributes ?? {}) as Record<string, string | undefined>;

          const normalizedColor = normalizeTextColor(color);

          const classNames = new Set<string>();

          if (className) {
            className
              .split(/\s+/)
              .map((item) => item.trim())
              .filter(Boolean)
              .forEach((item) => {
                if (!item.startsWith(TEXT_COLOR_CLASS_PREFIX)) {
                  classNames.add(item);
                }
              });
          }

          if (normalizedColor) {
            classNames.add(getTextColorClassName(normalizedColor));
          }

          const renderedAttributes: Record<string, string> = {};

          Object.entries(otherAttributes ?? {}).forEach(([key, value]) => {
            if (typeof value === "string" && value.length > 0) {
              renderedAttributes[key] = value;
            }
          });

          if (typeof style === "string" && style.length > 0) {
            renderedAttributes.style = style;
          }

          if (classNames.size > 0) {
            renderedAttributes.class = Array.from(classNames).join(" ");
          }

          return renderedAttributes;
        }
      }
    };
  }
}).configure({ mergeNestedSpanStyles: false });

export function usePublishEditor(onHtmlPaste: () => void) {
  const clipboardStrategyRef = useRef<ReturnType<typeof clipboardPlugin> | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      handlePaste: ((_: any, event: ClipboardEvent, __: any) => {
        // Store the strategy instance so we can clean it up later
        clipboardStrategyRef.current = clipboardPlugin(event, editor, onHtmlPaste);
        return clipboardStrategyRef.current.handle(event);
      }) as any
    },
    extensions: [
      PublishStarterKit,
      DelStrike,
      Placeholder.configure({
        placeholder: i18next.t("submit.body-placeholder")
      }),
      PublishTextStyle,
      Color,
      TextAlign.configure({
        types: ["heading", "paragraph", "youtubeVideo"]
      }),
      Selection,
      Table,
      TableRow,
      TableCell,
      TableHeader,
      PublishImage.extend({
        addNodeView() {
          return ReactNodeViewRenderer(PublishEditorImageViewer);
        }
      }),
      SafeLink,
      // User mention
      Mention.configure({
        HTMLAttributes: {
          class:
            "border border-[--border-color] rounded-lg px-1 py-0.5 bg-gray-100 dark:bg-dark-default text-blue-dark-sky"
        },
        suggestion: UserMentionExtensionConfig as any
      }),
      // Tags mention
      Mention.extend({
        name: "tag",
        priority: 102
      }).configure({
        HTMLAttributes: {
          class:
            "border border-[--border-color] rounded-lg px-1 py-0.5 bg-gray-100 dark:bg-dark-default text-blue-dark-sky"
        },
        suggestion: TagMentionExtensionConfig as any
      }),
      ThreeSpeakVideoExtension,
      YoutubeVideoExtension,
      HivePostExtension,
      LoomVideoExtension
    ],
    onUpdate({ editor }) {
      publishState.setContent(markdownToHtml(editor.getHTML()));
    }
  });

  usePublishLinksAttach(editor);
  useEditorDragDrop(editor);

  const publishState = usePublishState();

  const setEditorContent = useCallback(
    (content: string | undefined) => {
      try {
        const sanitized = content ? simpleMarkdownToHTML(content) : undefined;
        const doc = sanitized
          ? parseAllExtensionsToDoc(sanitized)
          : undefined;
        editor
          ?.chain()
          .setContent(doc ?? "", { emitUpdate: false })
          .run();
      } catch (e) {
        error("Failed to load local draft. We are working on it");
        console.error(e);
        editor?.commands.setContent("", { emitUpdate: false });
      }
    },
    [editor]
  );

  // Handle editor clearing
  useEffect(() => {
    if (!publishState.content && editor?.getText() !== "") {
      editor?.commands.setContent("", { emitUpdate: false });
    }
  }, [editor, publishState.content]);

  // Prefill editor with persistent content or default value
  useEffect(() => {
    if (editor) {
      setEditorContent(publishState.content);
    }
  }, [editor]);

  // Cleanup clipboard plugin blob URLs on unmount
  useEffect(() => {
    return () => {
      if (clipboardStrategyRef.current && "destroy" in clipboardStrategyRef.current) {
        (clipboardStrategyRef.current as any).destroy();
      }
    };
  }, []);

  return { editor, setEditorContent };
}

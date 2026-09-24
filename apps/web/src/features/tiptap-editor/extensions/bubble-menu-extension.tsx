import { Button, StyledTooltip } from "@/features/ui";
import { flip, shift, useFloating } from "@floating-ui/react-dom";
import { safeAutoUpdate } from "@ui/util";
import { posToDOMRect } from "@tiptap/core";
import {
  UilArrow,
  UilBold,
  UilExternalLinkAlt,
  UilItalic,
  UilLink,
  UilLinkBroken,
  UilPen,
  UilTextStrikeThrough
} from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PublishEditorToolbarLinkForm } from "./link-form";
import { openInNewTab } from "@/utils/open-in-new-tab";

interface Props {
  editor: any | null;
}

type BubbleMode = "link-actions" | "link-edit" | undefined;

export function BubbleMenu({ editor }: Props) {
  const [show, setShow] = useState(false);
  const [mode, setMode] = useState<BubbleMode>(undefined);
  const [linkHref, setLinkHref] = useState<string | undefined>(undefined);

  // True while the writer is actively editing a URL in the inline form. The
  // input steals focus from the editor, which churns selection/focus events —
  // this flag keeps the form mounted and anchored instead of tearing it down.
  const isEditingLinkRef = useRef(false);

  const { refs, floatingStyles } = useFloating({
    whileElementsMounted: safeAutoUpdate,
    middleware: [flip(), shift()],
    placement: "top",
    transform: true
  });

  const hideAll = useCallback(() => {
    isEditingLinkRef.current = false;
    setShow(false);
    setMode(undefined);
    setLinkHref(undefined);
  }, []);

  const anchorToSelection = useCallback(() => {
    if (!editor) {
      return;
    }
    const { from, to } = editor.state.selection;
    refs.setReference({
      getBoundingClientRect: () => posToDOMRect(editor.view, from, to)
    });
  }, [editor, refs]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const updateMenu = () => {
      // Keep the edit form open & anchored while the URL input holds focus.
      if (isEditingLinkRef.current) {
        anchorToSelection();
        setShow(true);
        return;
      }

      const { from, to } = editor.state.selection;
      const hasTextSelection = editor.state.doc.textBetween(from, to).length > 0;
      const inLink = editor.isActive("link");

      // Collapsed cursor in plain text, or focus moved away — nothing to show.
      if (!editor.isFocused || (!hasTextSelection && !inLink)) {
        hideAll();
        return;
      }

      anchorToSelection();

      if (hasTextSelection) {
        // A real text selection always shows the formatting toolbar so styling
        // works even over a link. Crucially, "select all" spans mixed content
        // (so `isActive('link')` is false) and no longer hijacks into link
        // mode — which previously stole focus and hid the selection.
        setMode(undefined);
        setLinkHref(inLink ? (editor.getAttributes("link").href as string) : undefined);
      } else {
        // Collapsed cursor sitting inside a link → quick link actions.
        setMode("link-actions");
        setLinkHref(editor.getAttributes("link").href as string);
      }

      setShow(true);
    };

    const handleBlur = ({ event }: { event?: FocusEvent }) => {
      const next = event?.relatedTarget as Node | null;
      // Focus moving into the bubble itself (e.g. the URL input or a toolbar
      // button) must keep it open; anything else dismisses it.
      if (next && refs.floating.current?.contains(next)) {
        return;
      }
      hideAll();
    };

    editor.on("selectionUpdate", updateMenu);
    editor.on("blur", handleBlur);

    return () => {
      editor.off("selectionUpdate", updateMenu);
      editor.off("blur", handleBlur);
    };
  }, [editor, refs, hideAll, anchorToSelection]);

  // Dismiss on an outside click. The editor `blur` handler can't cover this on
  // its own: once the link input holds focus, clicking elsewhere blurs the
  // input (not the editor), so no editor blur fires.
  useEffect(() => {
    if (!show) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (refs.floating.current?.contains(target)) {
        return;
      }
      // Clicks inside the editor are handled by selectionUpdate/blur.
      if (editor?.view.dom.contains(target)) {
        return;
      }
      hideAll();
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [show, editor, refs, hideAll]);

  const openLinkEdit = useCallback(() => {
    if (!editor) {
      return;
    }
    isEditingLinkRef.current = true;
    if (editor.isActive("link")) {
      setLinkHref(editor.getAttributes("link").href as string);
      // Expand to the whole link so it stays highlighted while the input is
      // focused and so submitting replaces the entire link, not just a slice.
      editor.chain().extendMarkRange("link").run();
    } else {
      setLinkHref(undefined);
    }
    setMode("link-edit");
    setShow(true);
  }, [editor]);

  const submitLink = useCallback(
    (href: string) => {
      if (!editor) {
        return;
      }
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
      // The link mark is inclusive (autolink), so collapsing to its end isn't
      // enough — typed text would inherit the link. Clear the stored link mark
      // too so the writer keeps typing plain text, and the menu closes instead
      // of re-opening over the freshly-edited link.
      const end = editor.state.selection.to;
      editor.chain().setTextSelection(end).unsetMark("link").run();
      hideAll();
    },
    [editor, hideAll]
  );

  const removeLink = useCallback(() => {
    if (!editor) {
      return;
    }
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    const end = editor.state.selection.to;
    editor.chain().setTextSelection(end).run();
    hideAll();
  }, [editor, hideAll]);

  const openLinkInNewTab = useCallback(() => {
    if (linkHref) {
      openInNewTab(linkHref);
    }
  }, [linkHref]);

  const cancelLinkEdit = useCallback(() => {
    hideAll();
    editor?.chain().focus().run();
  }, [editor, hideAll]);

  const portalContainer =
    typeof document !== "undefined"
      ? document.getElementById("popper-container") || document.body
      : null;

  return (
    portalContainer &&
    createPortal(
      <>
        {show && (
          <div
            ref={refs.setFloating}
            className="z-[1070] absolute"
            style={floatingStyles}
            onBlurCapture={(event) => {
              // Dismiss when keyboard focus (Tab/Shift+Tab) leaves the bubble.
              // A null relatedTarget is skipped on purpose: switching modes
              // unmounts the focused toolbar button a beat before the URL input
              // autofocuses, and treating that transient as "left" would slam
              // the popup shut the moment it opens. Real tab-outs land on a
              // concrete element, so they're still caught.
              const next = event.relatedTarget as Node | null;
              if (!next) {
                return;
              }
              if (refs.floating.current?.contains(next) || editor?.view.dom.contains(next)) {
                return;
              }
              hideAll();
            }}
          >
            {!mode && (
              <div className="animate-scale-in origin-bottom bg-white border border-[--border-color] max-w-[320px] text-blue-dark-sky px-1 rounded-lg text-xs font-semibold flex items-center">
                <StyledTooltip content={i18next.t("publish.action-bar.bold")}>
                  <Button
                    appearance={editor?.isActive("bold") ? "link" : "gray-link"}
                    size="sm"
                    onClick={() => editor?.chain().focus().toggleBold().run()}
                    icon={<UilBold />}
                    aria-label={i18next.t("publish.action-bar.bold")}
                    aria-pressed={editor?.isActive("bold")}
                  />
                </StyledTooltip>
                <StyledTooltip content={i18next.t("publish.action-bar.italic")}>
                  <Button
                    appearance={editor?.isActive("italic") ? "link" : "gray-link"}
                    size="sm"
                    onClick={() => editor?.chain().focus().toggleItalic().run()}
                    icon={<UilItalic />}
                    aria-label={i18next.t("publish.action-bar.italic")}
                    aria-pressed={editor?.isActive("italic")}
                  />
                </StyledTooltip>
                <StyledTooltip content={i18next.t("publish.action-bar.strikethrough")}>
                  <Button
                    appearance={editor?.isActive("strike") ? "link" : "gray-link"}
                    size="sm"
                    onClick={() => editor?.chain().focus().toggleStrike().run()}
                    icon={<UilTextStrikeThrough />}
                    aria-label={i18next.t("publish.action-bar.strikethrough")}
                    aria-pressed={editor?.isActive("strike")}
                  />
                </StyledTooltip>
                <StyledTooltip content={i18next.t("publish.action-bar.code")}>
                  <Button
                    appearance={editor?.isActive("code") ? "link" : "gray-link"}
                    size="sm"
                    onClick={() => editor?.chain().focus().toggleCode().run()}
                    icon={<UilArrow />}
                    aria-label={i18next.t("publish.action-bar.code")}
                    aria-pressed={editor?.isActive("code")}
                  />
                </StyledTooltip>
                <div className="h-[40px] w-[1px] bg-[--border-color] mx-2" />
                <StyledTooltip content={i18next.t("publish.action-bar.link")}>
                  <Button
                    appearance={editor?.isActive("link") ? "link" : "gray-link"}
                    size="sm"
                    onClick={openLinkEdit}
                    icon={<UilLink />}
                    aria-label={i18next.t("publish.action-bar.link")}
                    aria-pressed={editor?.isActive("link")}
                  />
                </StyledTooltip>
              </div>
            )}
            {mode === "link-actions" && (
              <div className="animate-scale-in origin-bottom bg-white border border-[--border-color] max-w-[360px] text-blue-dark-sky p-1 rounded-lg text-xs font-semibold flex items-center">
                <button
                  type="button"
                  onClick={openLinkInNewTab}
                  title={linkHref}
                  className="max-w-[180px] truncate px-2 py-1 text-left text-blue-dark-sky hover:text-blue-dark-sky-hover hover:underline"
                >
                  {linkHref}
                </button>
                <div className="h-[24px] w-[1px] bg-[--border-color] mx-1" />
                <StyledTooltip content={i18next.t("publish.action-bar.open-link")}>
                  <Button
                    appearance="gray-link"
                    size="sm"
                    onClick={openLinkInNewTab}
                    icon={<UilExternalLinkAlt />}
                    aria-label={i18next.t("publish.action-bar.open-link")}
                  />
                </StyledTooltip>
                <StyledTooltip content={i18next.t("publish.action-bar.edit-link")}>
                  <Button
                    appearance="gray-link"
                    size="sm"
                    onClick={openLinkEdit}
                    icon={<UilPen />}
                    aria-label={i18next.t("publish.action-bar.edit-link")}
                  />
                </StyledTooltip>
                <StyledTooltip content={i18next.t("publish.action-bar.remove-link")}>
                  <Button
                    appearance="gray-link"
                    size="sm"
                    onClick={removeLink}
                    icon={<UilLinkBroken />}
                    aria-label={i18next.t("publish.action-bar.remove-link")}
                  />
                </StyledTooltip>
              </div>
            )}
            {mode === "link-edit" && (
              <div className="animate-scale-in origin-bottom bg-white border border-[--border-color] max-w-[320px] text-blue-dark-sky p-1.5 rounded-lg text-xs font-semibold flex items-center">
                <PublishEditorToolbarLinkForm
                  key={linkHref ?? "new"}
                  initialValue={linkHref}
                  deletable={linkHref !== undefined}
                  onSubmit={submitLink}
                  onDelete={removeLink}
                  onCancel={cancelLinkEdit}
                />
              </div>
            )}
          </div>
        )}
      </>,
      portalContainer
    )
  );
}

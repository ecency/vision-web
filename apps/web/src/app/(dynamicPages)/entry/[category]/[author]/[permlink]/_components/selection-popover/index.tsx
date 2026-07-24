"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";

import { useCallback, useContext, useEffect, useRef, useState } from "react";

import {
  getLanguages,
  getTranslation,
  Language,
} from "@/api/translation";
import { Button } from "@/features/ui";
import { flip, shift } from "@floating-ui/dom";
import { useFloating } from "@floating-ui/react-dom";
import { safeAutoUpdate } from "@ui/util";
import { Modal, ModalBody, ModalHeader } from "@ui/modal";
import { Select } from "@ui/input/form-controls/select";
import { Spinner } from "@ui/spinner";
import {
  UilClipboardAlt,
  UilComment,
  UilLanguage,
  UilTwitter
} from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useCopyToClipboard, useMountedState } from "react-use";
import { EntryPageContext } from "../context";
import { useIsMobile } from "@/utils";

// https://github.com/FezVrasta/react-popper#usage-without-a-reference-htmlelement
// floating-ui requires `contextElement` on virtual references so internal
// functions like getOffsetParent / getClippingRect can traverse the DOM
// without hitting null.parentNode.
class VirtualSelectionReference {
  selection: Selection;
  contextElement: Element | undefined;

  constructor(selection: Selection) {
    this.selection = selection;
    // Provide a real DOM element so floating-ui can derive document, offset
    // parent, and overflow ancestors without null traversal errors.
    this.contextElement =
      selection.anchorNode instanceof Element
        ? selection.anchorNode
        : selection.anchorNode?.parentElement ?? undefined;
  }

  get clientWidth() {
    return this.getBoundingClientRect()?.width ?? 0;
  }

  get clientHeight() {
    return this.getBoundingClientRect()?.height ?? 0;
  }

  getBoundingClientRect() {
    if (this.selection.rangeCount > 0) {
      const rect = this.selection.getRangeAt(0).getBoundingClientRect();
      // Sanity check
      if (rect) return rect;
    }
    return new DOMRect();
  }
}

export const SelectionPopover = ({ children, postUrl }: any) => {
  const { activeUser } = useActiveAccount();
  const { setSelection, commentsInputRef } = useContext(EntryPageContext);

  const [_, copyToClipboard] = useCopyToClipboard();
  const isMounted = useMountedState();
  const isMobile = useIsMobile();

  const [selectedText, setSelectedText] = useState("");
  const [showQuote, setShowQuote] = useState(true);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translation, setTranslation] = useState("");
  const [translating, setTranslating] = useState(false);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [target, setTarget] = useState(i18next.language.split("-")[0]);

  const { refs, floatingStyles } = useFloating({
    whileElementsMounted: safeAutoUpdate,
    middleware: [flip(), shift()],
    placement: "top",
    transform: true
  });

  useEffect(() => {
    if (isMobile) {
      return;
    }
    const handleClickAway = (e: MouseEvent | TouchEvent) => {
      if (refs.floating.current?.contains(e.target as Node)) {
        return;
      }
      if (showTranslation) {
        const node = e.target;
        const target =
          node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
        if (target?.closest(".selection-translate-modal")) {
          return;
        }
      }
      if (selectedText) {
        setSelectedText("");
      }
    };
    const opts = { passive: true } as AddEventListenerOptions;
    document.addEventListener("pointerdown", handleClickAway, opts);
    document.addEventListener("touchstart", handleClickAway, opts);
    return () => {
      document.removeEventListener("pointerdown", handleClickAway, opts);
      document.removeEventListener("touchstart", handleClickAway, opts);
    };
  }, [isMobile, showTranslation, selectedText, refs]);

  const onQuotesClick = useCallback(
    (text: string) => {
      setSelection(`>${text}\n\n`);
      commentsInputRef?.current?.focus();
    },
    [commentsInputRef, setSelection]
  );

  const handleSelection = useCallback(
    (e?: Event) => {
      if (isMobile) {
        return;
      }
      if (showTranslation) {
        const node = e?.target ?? document.activeElement;
        const target =
          node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
        if (target?.closest(".selection-translate-modal")) {
          return;
        }
      }

      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) {
        const anchorEl =
          selection.anchorNode instanceof Element
            ? selection.anchorNode
            : selection.anchorNode?.parentElement;
        const inComment = anchorEl?.closest(
          ".comment-box, .discussion-item"
        );
        setShowQuote(!inComment);
        refs.setReference(new VirtualSelectionReference(selection) as any);
        setSelectedText(selection.toString());
      } else {
        setSelectedText("");
        setShowQuote(true);
      }
    },
    [refs, showTranslation, isMobile]
  );

  useEffect(() => {
    setShowTranslation(false);
    setTranslation("");
    setTarget(i18next.language.split("-")[0]);
  }, [selectedText]);

  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null
  );

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const el = document.getElementById("popper-container") || document.body;
    setPortalContainer(el);
  }, []);

  const pointerDown = useRef(false);

  useEffect(() => {
    if (isMobile) {
      return;
    }
    const onPointerDown = () => {
      pointerDown.current = true;
    };
    const onPointerUp = (e: Event) => {
      pointerDown.current = false;
      handleSelection(e);
    };
    const onKeyUp = (e: Event) => handleSelection(e);
    const onSelectionChange = (e: Event) => {
      if (!pointerDown.current) {
        handleSelection(e);
      }
    };

    const opts = { passive: true } as AddEventListenerOptions;
    document.addEventListener("pointerdown", onPointerDown, opts);
    document.addEventListener("pointerup", onPointerUp, opts);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("selectionchange", onSelectionChange);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, opts);
      document.removeEventListener("pointerup", onPointerUp, opts);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [handleSelection, isMobile]);

  useEffect(() => {
    if (showTranslation) {
      getLanguages().then(setLanguages);
    }
  }, [showTranslation]);

  useEffect(() => {
    if (showTranslation) {
      setTranslating(true);
      setTranslation("");
      getTranslation(selectedText, "auto", target)
        .then((r) => setTranslation(r.translatedText))
        .finally(() => setTranslating(false));
    }
  }, [showTranslation, selectedText, target]);

  const onTranslateClick = useCallback(() => {
    setTarget(i18next.language.split("-")[0]);
    setShowTranslation(true);
  }, []);
  if (isMobile) {
    return <div>{children}</div>;
  }

  return (
    <div>
      {children}

      {isMounted() &&
        selectedText &&
        portalContainer &&
        createPortal(
          selectedText ? (
            <div ref={refs.setFloating} style={floatingStyles}>
              <div className="animate-fade-in-up p-2 flex border border-[--border-color] rounded-xl gap-3 bg-white items-center">
                <Button
                  noPadding={true}
                  icon={<UilClipboardAlt />}
                  appearance="gray-link"
                  aria-label={i18next.t("g.copy", { defaultValue: "Copy" })}
                  onClick={() => {
                    copyToClipboard(selectedText);
                    setSelectedText("");
                    setSelection("");
                  }}
                />
                <Link
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${selectedText} https://ecency.com${postUrl}`)}`}
                  target="_external"
                >
                  <Button
                    noPadding={true}
                    icon={<UilTwitter />}
                    appearance="gray-link"
                    aria-label={i18next.t("g.share", { defaultValue: "Share" })}
                    onClick={() => setSelectedText("")}
                  />
                </Link>

                {selectedText.length <= 300 && (
                  <Button
                    noPadding={true}
                    icon={<UilLanguage />}
                    appearance="gray-link"
                    aria-label={i18next.t("selection-popover.translate", { defaultValue: "Translate" })}
                    onClick={onTranslateClick}
                  />
                )}

                {activeUser && showQuote && (
                  <Button
                    noPadding={true}
                    icon={<UilComment />}
                    appearance="gray-link"
                    aria-label={i18next.t("selection-popover.quote", { defaultValue: "Quote" })}
                    onClick={() => {
                      setSelectedText("");
                      onQuotesClick(selectedText);
                      document
                        .getElementsByClassName("comment-box")[0]
                        ?.scrollIntoView({ block: "center" });
                    }}
                  />
                )}
              </div>
            </div>
          ) : (
            <></>
          ),
          portalContainer
        )}

      {showTranslation && (
        <Modal
          show={true}
          onHide={() => setShowTranslation(false)}
          className="flex justify-center items-center pt-0"
          dialogClassName="mt-0 rounded-xl selection-translate-modal"
        >
          <ModalHeader closeButton={true}>
            {i18next.t("entry-menu.translate")}
          </ModalHeader>
          <ModalBody className="min-h-[120px] pb-6">
            <div className="mb-3">
              <label className="block text-sm mb-1">
                {i18next.t("entry-translate.target-language")}
              </label>
              <Select
                type="select"
                value={target}
                size="sm"
                onChange={(e) => setTarget(e.currentTarget.value)}
              >
                {languages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </Select>
            </div>
            {translating ? (
              <div className="flex justify-center p-3">
                <Spinner className="size-4" />
              </div>
            ) : (
              <p className="whitespace-pre-line text-sm">{translation}</p>
            )}
          </ModalBody>
        </Modal>
      )}
    </div>
  );
};

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject
} from "react";
import { createPortal } from "react-dom";
import { flip, offset, shift, size, useFloating } from "@floating-ui/react-dom";
import "./_index.scss";
import Picker from "@emoji-mart/react";
import emojiData from "@emoji-mart/data";
import { useGlobalStore } from "@/core/global-store";
import { classNameObject, safeAutoUpdate } from "@ui/util";

interface Props {
  show: boolean;
  changeState: (show: boolean) => void;
  onSelect: (e: string) => void;
  isDisabled?: boolean;
  style?: CSSProperties;
  rootRef?: MutableRefObject<HTMLDivElement | null>;
  buttonRef?: MutableRefObject<HTMLElement | null>;
  position?: "top" | "bottom";
}

// emoji-mart sizes the picker from its own `:host` rule (435px tall). Outside
// CSS beats `:host`, so this is the height the panel is actually laid out with
// and the most it may take; when the viewport leaves less room it gets less.
const PICKER_HEIGHT = 435;
const VIEWPORT_PADDING = 8;

export function EmojiPicker({
  show,
  changeState,
  onSelect,
  isDisabled,
  style,
  rootRef,
  buttonRef,
  position = "bottom"
}: Props) {
  const internalRootRef = useRef<HTMLDivElement | null>(null);
  const ref = rootRef ?? internalRootRef;
  const theme = useGlobalStore((state) => state.theme);
  const [portalContainer, setPortalContainer] = useState<Element | null>(null);

  // Anchored to the trigger and measured from the panel's real size. The
  // previous version guessed the size and wrote the coordinates from an effect
  // that ran after the first paint, without ever recalculating. It flashed at
  // its static position (a whole viewport away on a scrolled page), jumped to
  // the estimate, hung 47px off the bottom of the screen because the estimate
  // was 55px short of the real height then stayed put while the page scrolled.
  const { refs, floatingStyles, isPositioned } = useFloating({
    strategy: "fixed",
    // `-end` keeps the panel's trailing edge on the trigger's trailing edge.
    placement: position === "top" ? "top-end" : "bottom-end",
    // Write top/left rather than a transform, so the small-screen stylesheet
    // can still pin the panel as a bottom sheet.
    transform: false,
    whileElementsMounted: safeAutoUpdate,
    middleware: [
      offset(8),
      flip({ padding: VIEWPORT_PADDING }),
      shift({ padding: VIEWPORT_PADDING }),
      size({
        padding: VIEWPORT_PADDING,
        apply({ availableHeight, elements }) {
          // Never taller than the room left on the chosen side: a floor here
          // would push the panel back off-screen on a very short viewport, and
          // the panel scrolls internally, so a shorter one is still usable.
          elements.floating.style.setProperty(
            "--emoji-picker-height",
            `${Math.min(PICKER_HEIGHT, Math.max(0, Math.floor(availableHeight)))}px`
          );
        }
      })
    ]
  });

  const { setReference, setFloating } = refs;

  useEffect(() => {
    setReference(buttonRef?.current ?? null);
  }, [buttonRef, setReference]);

  useEffect(() => {
    setPortalContainer(document.getElementById("popper-container") ?? document.body);
  }, []);

  const setDialogRef = useCallback(
    (node: HTMLDivElement | null) => {
      ref.current = node;
      setFloating(node);
    },
    [ref, setFloating]
  );

  // Handle click outside to close picker (same pattern as GIF picker)
  useEffect(() => {
    if (!show) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const targetNode = event.target as Node | null;

      if (!targetNode) {
        return;
      }

      // Don't close if clicking inside the picker
      if (ref.current?.contains(targetNode)) {
        return;
      }

      // Don't close if clicking the button that opens the picker
      // This prevents the picker from closing on pointerdown then reopening on click
      if (buttonRef?.current?.contains(targetNode)) {
        return;
      }

      changeState(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [show, changeState, buttonRef, ref]);

  if (!show || !portalContainer) {
    return null;
  }

  const mergedStyle: CSSProperties = {
    ...floatingStyles,
    zIndex: 9999,
    // Nothing is drawn until the panel has been measured against the viewport,
    // otherwise the first paint lands at the top-left corner.
    visibility: isPositioned ? "visible" : "hidden",
    ...style
  };

  return createPortal(
    <div
      ref={setDialogRef}
      className={classNameObject({
        "emoji-picker-dialog": true
      })}
      style={mergedStyle}
    >
      <Picker
        data={emojiData}
        dynamicWidth={true}
        onEmojiSelect={(e: { native: string }) => {
          if (isDisabled) {
            return;
          }
          onSelect(e.native);
          changeState(false);
        }}
        previewPosition="none"
        // Render native emoji glyphs so we don't depend on sprite sheets that may not load
        set="native"
        theme={theme === "day" ? "light" : "dark"}
      />
    </div>,
    portalContainer
  );
}

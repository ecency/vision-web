"use client";

import { classNameObject, useFilteredProps } from "@ui/util";
import { HTMLProps, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useMountedState from "react-use/lib/useMountedState";
import { useMountTransition } from "@/core/hooks";
import { ModalContext } from "./modal-context";

interface Props {
  show: boolean;
  onHide: () => void;
  centered?: boolean;
  animation?: boolean;
  size?: "md" | "lg" | "sm";
  dialogClassName?: string;
  overlayClassName?: string;
  raw?: boolean;
  // How long the exit transition of the slowest animated piece runs. The modal
  // stays mounted this long after closing so CSS exits can play
  // (e.g. ModalSidebar's 300ms slide).
  exitDurationMs?: number;
  // Route every dismiss gesture (header close button, backdrop click, Escape)
  // through onHide instead of closing internally, so the parent DECIDES whether
  // the modal closes: it closes only when the parent flips `show` to false. By
  // default a gesture closes the modal first and onHide is only a notification,
  // which makes an onHide guard useless. Opt in when a flow must stay on screen
  // (e.g. a card payment confirm in flight).
  dismissViaOnHide?: boolean;
}

export function Modal(props: Omit<HTMLProps<HTMLDivElement>, "size"> & Props) {
  const [show, setShow] = useState<boolean>();

  const nativeProps = useFilteredProps(props, [
    "size",
    "animation",
    "show",
    "onHide",
    "centered",
    "dialogClassName",
    "raw",
    "exitDurationMs",
    "dismissViaOnHide"
  ]);
  const isAnimated = useMemo(() => props.animation ?? true, [props.animation]);

  const isMounted = useMountedState();

  // CSS-transition replacement for AnimatePresence: `mounted` keeps the modal
  // in the DOM while the exit transition plays (unmount is timer-based, so
  // live content updating inside a closing modal can never strand it on
  // screen), `open` drives the enter/exit classes.
  // Non-animated modals default to instant unmount — without exit classes the
  // content would linger fully visible for the exit window (ModalSidebar
  // passes an explicit exitDurationMs for its sliding surface).
  const { mounted, open } = useMountTransition(
    show === true,
    props.exitDurationMs ?? (isAnimated ? 200 : 0)
  );

  const portalContainer =
    typeof document !== "undefined"
      ? document.querySelector("#modal-dialog-container") || document.body
      : null;

  const showRef = useRef(show);
  showRef.current = show;

  // Holds the previous internal `show` so onHide() fires only on a genuine
  // open→close transition (see the effect below). Updated inside that effect.
  const prevShowRef = useRef(show);

  // A dismiss GESTURE (as opposed to the parent clearing `show`). With
  // dismissViaOnHide the gesture is forwarded to the parent, which closes by
  // flipping `show`; otherwise it closes internally as before. Kept in a ref so
  // the mount-scoped Escape listener always sees the current props.
  const dismiss = () => {
    if (props.dismissViaOnHide) {
      props.onHide();
    } else {
      setShow(false);
    }
  };
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  useEffect(() => {
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showRef.current === true) {
        dismissRef.current();
      }
    };
    document.addEventListener("keyup", onKeyUp);
    return () => {
      document.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    setShow(props.show);
  }, [props.show]);

  useEffect(() => {
    const prevShow = prevShowRef.current;
    prevShowRef.current = show;

    // Notify the parent only when the modal actually transitions from open to
    // closed (backdrop click, ESC, or the parent clearing `show`). Previously
    // this fired whenever `show` was false — including the initial
    // undefined→false settle — so onHide() ran on mount for every closed modal,
    // resetting state in parents whose onHide has side effects (e.g. the
    // notifications dialog toggling its global store flag, which made the
    // navbar bell need a second click).
    if (prevShow === true && show === false) {
      props.onHide();
    }
  }, [show]);

  useEffect(() => {
    if (show) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }
    return () => {
      document.body.classList.remove("overflow-hidden");
    };
  }, [show]);

  // Children (e.g. the header close button) close via context.setShow(false);
  // that is a dismiss gesture too, so route it the same way. Opening stays direct.
  const contextSetShow = (v: boolean) => {
    if (v === false) {
      dismiss();
    } else {
      setShow(v);
    }
  };

  return (
    <ModalContext.Provider value={{ show, setShow: contextSetShow, open }}>
      {isMounted() &&
        portalContainer &&
        mounted &&
        createPortal(
          <div
            className={classNameObject({
              "bg-black z-[1100] fixed top-0 left-0 right-0 bottom-0 transition-opacity duration-200": true,
              "opacity-50": open,
              // While closing, let clicks reach the page instead of the dying
              // overlay/wrapper (restored automatically on mid-exit reopen).
              "opacity-0 pointer-events-none": !open,
              [props.overlayClassName ?? ""]: !!props.overlayClassName
            })}
          />,
          portalContainer
        )}

      {isMounted() &&
        portalContainer &&
        mounted &&
        createPortal(
          <div
            {...nativeProps}
            className={classNameObject({
              "z-[1100] fixed top-0 pt-24 sm:py-4 md:py-8 left-0 right-0 bottom-0 overflow-y-auto h-full sm:h-auto": true,
              [props.className ?? ""]: true,
              "pointer-events-none": !open,
              "flex justify-center items-start": props.centered
            })}
            onClick={() => dismiss()}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className={classNameObject({
                "ecency-modal-content": true,
                "transition-[opacity,transform] duration-200 ease-out": isAnimated,
                "opacity-100 translate-y-0": isAnimated && open,
                "opacity-0 translate-y-6": isAnimated && !open,
                " md:my-[3rem] w-full mt-auto mx-0 sm:mt-0 sm:mx-3 bg-white border border-[--border-color] rounded-t-xl sm:rounded-xl sm:w-[calc(100%-2rem)]":
                  !props.raw,
                "max-w-[500px]": !props.size || props.size === "md",
                "max-w-[800px]": props.size === "lg",
                "w-full sm:max-w-[375px]": props.size === "sm",
                [props.dialogClassName ?? ""]: true
              })}
            >
              {props.children}
            </div>
          </div>,
          portalContainer
        )}
    </ModalContext.Provider>
  );
}

export * from "./modal-context";
export * from "./modal-body";
export * from "./modal-footer";
export * from "./modal-header";
export * from "./modal-title";

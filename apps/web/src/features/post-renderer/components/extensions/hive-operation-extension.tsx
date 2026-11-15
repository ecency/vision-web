"use client";

import React, { RefObject, useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { Operation } from "@ecency/sdk";
import defaults from "@/defaults";
import { unmountRootsLater } from "../utils/unmount-roots-later";
import { swapIn, runUndos } from "../utils/dom-swap";

interface Props {
    op: string;
}

// Hive usernames are 3-16 chars, lowercase letters, digits, dot, hyphen.
// Anything else is rejected before being used in URL paths or rendered.
const HIVE_USERNAME_RE = /^[a-z][a-z0-9.-]{2,15}$/;

export function HiveOperationRenderer({ op }: Props) {
    const decodedOp = useMemo(() => {
        try {
            const raw = atob(op);
            return JSON.parse(raw) as Operation;
        } catch (e) {
            return undefined;
        }
    }, [op]);

    const decodedOpType = useMemo(
        () => decodedOp?.[0].split("_").join(" "),
        [decodedOp]
    );

    const safeTo = useMemo(() => {
        if (!decodedOp || decodedOp[0] !== "transfer") return undefined;
        const to = decodedOp[1].to;
        return typeof to === "string" && HIVE_USERNAME_RE.test(to) ? to : undefined;
    }, [decodedOp]);

    return (
        <>
      <span className="er-hive-op-label">
        Hive operation, click to Sign
      </span>
            {!decodedOp && op}
            <div className="er-hive-op-content">
                {decodedOp && (
                    <>
                        <div className="er-hive-op-type">
                            {decodedOpType}
                        </div>
                        {decodedOp[0] === "transfer" && safeTo && (
                            <div className="er-hive-op-transfer">
                <span className="er-hive-op-transfer-highlight">
                  {String(decodedOp[1].amount)}
                </span>
                                <span> to</span>
                                <img
                                    src={`${defaults.imageServer}/u/${safeTo}/avatar/small`}
                                    className="er-hive-op-transfer-image"
                                    alt=""
                                />
                                <span className="er-hive-op-transfer-highlight">
                  {safeTo}
                </span>
                            </div>
                        )}
                    </>
                )}
            </div>
        </>
    );
}

export function HiveOperationExtension({
    containerRef,
    onClick,
    html,
}: {
    containerRef: RefObject<HTMLElement | null>;
    onClick?: (op: string) => void;
    /** The rendered body. A change replaces the links, so they are enhanced again (#2083). */
    html?: string | null;
}) {
    const rootsRef = useRef<ReturnType<typeof createRoot>[]>([]);
    const undosRef = useRef<(() => void)[]>([]);
    const onClickRef = useRef(onClick);
    useEffect(() => {
        onClickRef.current = onClick;
    }, [onClick]);

    useEffect(() => {
        Array.from(
            containerRef.current?.querySelectorAll<HTMLElement>(
                ".markdown-view:not(.markdown-view-pure) .markdown-external-link"
            ) ?? []
        )
            .filter((element) => element.innerText?.startsWith("hive://sign/op/"))
            .forEach((element) => {
                try {
                    // Verify element is still connected to the DOM before manipulation
                    if (!element.isConnected || !element.parentNode) {
                        console.warn("Hive operation element is not connected to DOM, skipping");
                        return;
                    }

                    const container = document.createElement("div");
                    container.classList.add("er-hive-op");

                    const op = element.innerText.replace("hive://sign/op/", "");

                    container.addEventListener("click", () => onClickRef.current?.(op));

                    const root = createRoot(container);
                    rootsRef.current.push(root);
                    root.render(<HiveOperationRenderer op={op} />);

                    // Final safety check before replacing
                    if (element.isConnected && element.parentElement) {
                        undosRef.current.push(swapIn(element, container));
                    }
                } catch (error) {
                    console.warn("Error enhancing Hive operation element:", error);
                }
            });

        return () => {
            unmountRootsLater(rootsRef.current);
            rootsRef.current = [];
            runUndos(undosRef.current);
        };
    }, [containerRef, html]);

    return null;
}

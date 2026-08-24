"use client";

import { Entry } from "@/entities";
import { SelectionPopover } from "./selection-popover";
import { EntryPageViewerManager } from "./entry-page-viewer-manager";
import { useContext, useEffect, useState } from "react";
import { SafeTweet } from "@/features/shared/safe-tweet";
import { EntryPageContext } from "./context";
import dynamic from "next/dynamic";
import { makeEntryPath } from "@/utils";
import i18next from "i18next";

// The edit composer pulls the Comment editor (toolbar, image/video upload,
// polls, gif picker). It only renders in edit mode, so keep it out of the
// read-path bundle and load it on demand when the user enters editing. The
// loading fallback avoids a blank slot during the first chunk download.
// Interaction-only: the signing dialog opens when a reader clicks an embedded
// hive:// operation link. Keep it out of the read-path bundle (#1668) and load
// it on demand; `show` is false until then, so nothing renders during SSR.
const TransactionSigner = dynamic(
  () => import("@/features/shared/transactions/transaction-signer"),
  { ssr: false }
);

const EntryPageEdit = dynamic(
  () => import("./entry-page-edit").then((m) => m.EntryPageEdit),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center min-h-40 opacity-60">
        {i18next.t("g.loading")}
      </div>
    )
  }
);

interface Props {
  entry: Entry;
}

export function EntryPageBodyViewer({ entry }: Props) {
  const [signingOperation, setSigningOperation] = useState<string>();
  const { isRawContent, isEdit, editHistory } = useContext(EntryPageContext);

  useEffect(() => {
    if (isRawContent || isEdit || editHistory) {
      return;
    }

    if (typeof document === "undefined") {
      return;
    }

    const el = document.getElementById("post-body");

    if (!(el instanceof HTMLElement)) {
      return;
    }

    // Enhanced null-safe checking for iOS Safari compatibility
    const isElementSafe = (element: HTMLElement | null): boolean => {
      try {
        if (!element) return false;

        // Safe parentNode access with try-catch for iOS Safari iframe security errors
        const hasParent = (() => {
          try {
            return !!element.parentNode;
          } catch (securityError) {
            // iOS Safari throws SecurityError when trying to access parentNode in cross-origin contexts
            console.warn("Cross-origin security restriction detected, treating as disconnected element");
            return false;
          }
        })();

        if (!hasParent) return false;

        // Additional safety check for isConnected property
        try {
          return element.isConnected;
        } catch (securityError) {
          // Fallback if isConnected check also fails due to security restrictions
          console.warn("isConnected check failed, assuming element is connected");
          return true;
        }
      } catch (error) {
        console.warn("Element safety check failed:", error);
        return false;
      }
    };

    if (!isElementSafe(el)) {
      return;
    }

    // Add a small delay to ensure DOM is fully rendered and stable.
    // Post-render enhancements (embeds, image zoom, etc.) and their heavy
    // deps (medium-zoom, the link/embed enhancers) are code-split out of the
    // post page's first client chunk and loaded lazily here, after hydration.
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          // Re-verify the element is still safe before proceeding
          if (!isElementSafe(el)) {
            console.warn("Post body element is not safely accessible, skipping enhancements");
            return;
          }

          const { setupPostEnhancements } = await import(
            "@/features/post-renderer/components/utils/setupPostEnhancements"
          );

          // The effect may have been cleaned up while the chunk was loading
          if (cancelled || !isElementSafe(el)) {
            return;
          }

          cleanup = setupPostEnhancements(el, {
            onHiveOperationClick: (op) => {
              setSigningOperation(op);
            },
            TwitterComponent: SafeTweet,
            images: entry.json_metadata?.image,
          });
        } catch (e) {
          // Avoid breaking the page if enhancements fail, e.g. due to missing embeds or DOM structure issues
          console.error("Failed to setup post enhancements", e);

          // Enhanced error handling for iOS Safari specific issues
          if (e instanceof TypeError) {
            if (e.message.includes("parentNode")) {
              console.error("DOM structure issue detected - element may have been modified or removed during enhancement setup");
            } else if (e.message.includes("null is not an object")) {
              console.error("iOS Safari cross-origin security error detected - iframe embeds may be restricted");
            }
          } else if (e instanceof Error && e.name === "SecurityError") {
            console.error("Cross-origin security error detected - this is common on iOS Safari with iframe embeds");
          }
        }
      })();
    }, 100);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      cleanup?.();
    };
  }, [isRawContent, isEdit, editHistory, entry.json_metadata?.image]);

  return (
    <EntryPageViewerManager>
      {!isEdit && (
        <SelectionPopover
          postUrl={makeEntryPath(entry.category, entry.author, entry.permlink)}
        >
          {/* nothing here, SSR will render #post-body */}
        </SelectionPopover>
      )}
      {isEdit && entry.parent_author && <EntryPageEdit entry={entry} />}
      {signingOperation !== undefined && (
        <TransactionSigner
          show={true}
          onHide={() => setSigningOperation(undefined)}
          operation={signingOperation}
        />
      )}
    </EntryPageViewerManager>
  );
}

"use client";

import { Spinner } from "@ui/spinner";
import type { JSX } from "react";

/**
 * Fallback for dynamically imported modals (#1669 review): rendered from the
 * moment a dialog is requested until its chunk mounts, so a first open never
 * shows nothing while the network fetch runs. Same layer as the modal that
 * replaces it.
 */
export function DialogChunkSpinner(): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/30"
      aria-busy="true"
    >
      <Spinner className="size-6 text-white" />
    </div>
  );
}

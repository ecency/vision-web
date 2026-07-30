"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSaveDraftApi } from "../_api";
import { useOptionalUploadTracker } from "./use-upload-tracker";

/**
 * Moves the writer into the draft that autosave has been writing to.
 *
 * Autosave deliberately does not redirect - being navigated mid-sentence, or
 * while an image is still uploading, is its own way to lose work - so the
 * composer keeps writing to a draft the writer is never shown. The result is a
 * post that is safely stored and looks, from `/publish`, exactly like a post
 * that was thrown away. This is the manual way across.
 *
 * The flush is the point: `/publish/drafts/[id]` clears publish state and
 * refills it from the server copy, which autosave may have written up to a
 * minute ago. Navigating without saving first would quietly replace everything
 * typed since with that older copy.
 */
export function useOpenAutosavedDraft(draftId?: string) {
  const router = useRouter();
  const uploadTracker = useOptionalUploadTracker();
  const { mutateAsync: saveToDraft, isPending } = useSaveDraftApi(draftId);

  const openDraft = useCallback(async () => {
    if (!draftId) {
      return;
    }

    // Images resolve into the body only once their upload finishes, so a draft
    // flushed mid-upload would be stored without them.
    if (uploadTracker?.hasPendingUploads) {
      await uploadTracker.waitForUploads();
    }

    try {
      await saveToDraft({ showToast: false, redirect: false });
    } catch {
      // useSaveDraftApi already surfaces the error. Staying put is the safe
      // outcome: the newest content is still in memory here, and the draft
      // route would show the stale server copy instead.
      return;
    }

    router.push(`/publish/drafts/${draftId}`);
  }, [draftId, router, saveToDraft, uploadTracker]);

  return { openDraft, isOpening: isPending };
}

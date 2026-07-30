"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useOptionalUploadTracker } from "./use-upload-tracker";

interface Options {
  draftId?: string;
  /**
   * The autosave engine's serialised flush. Deliberately not a mutation of our
   * own: a second `useSaveDraftApi` here would write outside the engine's
   * ordering, so a slow autosave already on the wire could land after this
   * flush and put older content back on the server - and into the drafts cache -
   * moments before we navigate to read it.
   */
  flush: () => Promise<string | undefined>;
}

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
export function useOpenAutosavedDraft({ draftId, flush }: Options) {
  const router = useRouter();
  const uploadTracker = useOptionalUploadTracker();
  const [isOpening, setIsOpening] = useState(false);

  const openDraft = useCallback(async () => {
    if (!draftId || isOpening) {
      return;
    }

    setIsOpening(true);

    try {
      // Images resolve into the body only once their upload finishes, so a
      // draft flushed mid-upload would be stored without them.
      if (uploadTracker?.hasPendingUploads) {
        await uploadTracker.waitForUploads();
      }

      await flush();
    } catch {
      // useSaveDraftApi already surfaces the error. Staying put is the safe
      // outcome: the newest content is still in memory here, and the draft
      // route would show the stale server copy instead.
      return;
    } finally {
      setIsOpening(false);
    }

    router.push(`/publish/drafts/${draftId}`);
  }, [draftId, flush, isOpening, router, uploadTracker]);

  return { openDraft, isOpening };
}

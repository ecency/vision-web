"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import useLocalStorage from "react-use/lib/useLocalStorage";
import { PREFIX } from "@/utils/local-storage";
import routes from "@/routes";
import { PostBase } from "@/app/submit/_types";
import { hasDraftableContent } from "../_utils/content";
import { usePublishState } from "./use-publish-state";

export const SUBMIT_LOCAL_DRAFT_KEY = PREFIX + "_local_draft";

/**
 * Hands the post in the composer over to the classic editor.
 *
 * "Back to classic editor" used to be a bare router.push, which dropped
 * everything typed so far: publish state lives only in memory, and the classic
 * editor restores from its own local draft, which the composer never wrote. So
 * the one escape hatch offered to someone unhappy with the composer was itself
 * a way to lose the post.
 *
 * A complete PostBase is written, never a partial one - the submit page reads
 * title as a string and tags as an array, and a half-filled object used to
 * crash it on mount.
 *
 * This reads the body as it stands, so the caller must not offer the action
 * while an image is still uploading: that markdown is only written into the
 * body once the upload resolves, and handing over first would transfer a post
 * without the image and unmount the composer tracking it. The action bar gates
 * it on `hasPendingUploads`, the same condition it already applies to Continue.
 * Awaiting the uploads here instead is not sound - the value would have to be
 * re-read after the wait, and the await continuation is a microtask that can
 * run before React has committed the render carrying the new body.
 */
export function useBackToClassic() {
  const router = useRouter();
  const [, setLocalDraft] = useLocalStorage<PostBase>(SUBMIT_LOCAL_DRAFT_KEY);
  const { title, content, tags, metaDescription } = usePublishState();

  return useCallback(() => {
    // Only overwrite the classic editor's draft when there is something worth
    // handing over, so leaving an untouched composer cannot wipe a post
    // already in progress over there.
    if (hasDraftableContent(title, content)) {
      setLocalDraft({
        title: title ?? "",
        tags: tags ?? [],
        body: content ?? "",
        description: metaDescription ?? ""
      });
    }

    router.push(routes.SUBMIT);
  }, [content, metaDescription, router, setLocalDraft, tags, title]);
}

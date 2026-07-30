"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import useLocalStorage from "react-use/lib/useLocalStorage";
import { PREFIX } from "@/utils/local-storage";
import routes from "@/routes";
import { PostBase } from "@/app/submit/_types";
import { hasDraftableContent } from "../_utils/content";
import { usePublishState } from "./use-publish-state";

export const SUBMIT_LOCAL_DRAFT_KEY = PREFIX + "_local_draft";

function readStoredDraft(): PostBase | undefined {
  // Read through, rather than the useLocalStorage snapshot: that value is a
  // mount-time copy, and the classic editor may have been written by another
  // tab since. Getting this wrong would mean overwriting a post we believed
  // was not there.
  try {
    const raw = localStorage.getItem(SUBMIT_LOCAL_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as PostBase) : undefined;
  } catch {
    return undefined;
  }
}

function holdsPost(draft: PostBase | undefined) {
  return !!(draft?.title?.trim() || draft?.body?.trim());
}

/**
 * Hands the post in the composer over to the classic editor.
 *
 * "Back to classic editor" used to be a bare router.push, which dropped
 * everything typed so far: publish state lives only in memory, and the classic
 * editor restores from its own local draft, which the composer never wrote. So
 * the one escape hatch offered to someone unhappy with the composer was itself
 * a way to lose the post.
 *
 * The handover is destructive in the other direction though, and that needs
 * consent rather than a guard. The classic editor's local draft is the *only*
 * copy of an unsaved /submit post - there is no server draft behind it - so
 * overwriting it silently destroys work. Checking only "does the composer have
 * something" covered the empty-composer case and nothing else.
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
 */
export function useBackToClassic() {
  const router = useRouter();
  const [, setLocalDraft] = useLocalStorage<PostBase>(SUBMIT_LOCAL_DRAFT_KEY);
  const { title, content, tags, metaDescription } = usePublishState();
  const [conflict, setConflict] = useState(false);

  const handOver = useCallback(() => {
    setLocalDraft({
      title: title ?? "",
      tags: tags ?? [],
      body: content ?? "",
      description: metaDescription ?? ""
    });
    router.push(routes.SUBMIT);
  }, [content, metaDescription, router, setLocalDraft, tags, title]);

  const backToClassic = useCallback(() => {
    // Nothing worth handing over, so leave whatever is over there alone.
    if (!hasDraftableContent(title, content)) {
      router.push(routes.SUBMIT);
      return;
    }

    if (holdsPost(readStoredDraft())) {
      setConflict(true);
      return;
    }

    handOver();
  }, [content, handOver, router, title]);

  return {
    backToClassic,
    /** True while waiting on consent to replace an unsaved classic post. */
    conflict,
    confirmHandOver: useCallback(() => {
      setConflict(false);
      handOver();
    }, [handOver]),
    cancelHandOver: useCallback(() => setConflict(false), [])
  };
}

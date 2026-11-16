import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePublishState } from "./use-publish-state";
import { useDraftAutosave } from "./use-draft-autosave";
import { hasDraftableContent } from "../_utils/content";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { clearAutosavePointer, writeAutosavePointer } from "../_utils/autosave-pointer";

/**
 * Auto-saves the publish page into a draft whenever the post changes. The
 * first save creates the draft, every later one updates it.
 *
 * Each save also records which draft it went to, so a later visit can offer to
 * resume it (useResumeAutosavedDraft) instead of the draft being orphaned.
 */
export function usePublishAutosave() {
  const { activeUser } = useActiveAccount();

  const {
    title,
    content,
    tags,
    beneficiaries,
    reward,
    metaDescription,
    selectedThumbnail,
    poll,
    postLinks,
    location,
    decentMemes,
    clearGeneration
  } = usePublishState();

  const snapshot = useMemo(
    () => ({
      title,
      content,
      tags,
      beneficiaries,
      reward,
      metaDescription,
      selectedThumbnail,
      poll,
      postLinks,
      location,
      decentMemes
    }),
    [
      title,
      content,
      tags,
      beneficiaries,
      reward,
      metaDescription,
      selectedThumbnail,
      poll,
      postLinks,
      location,
      decentMemes
    ]
  );

  const autosave = useDraftAutosave({
    enabled: !!activeUser?.username && hasDraftableContent(title, content),
    snapshot,
    resetKey: clearGeneration
  });

  const username = activeUser?.username;
  const { draftId, lastSaved } = autosave;

  // The pointer this composer last wrote, and for whom. Written only when a
  // save lands: an account switch with the page still open re-runs this effect
  // with the new username and the previous account's draft, which must not be
  // filed under the new account.
  const writtenRef = useRef<{ username: string; id: string; savedAt: Date } | null>(null);
  // Set once the post is published, until the composer resets for the next one.
  // Publish can succeed while the first autosave is still on the wire, and the
  // reset (clearAll) commits a render later, so that save can still land for
  // the published post; it must not point a later visit at it.
  const forgottenRef = useRef(false);
  useEffect(() => {
    if (
      forgottenRef.current ||
      !username ||
      !draftId ||
      !lastSaved ||
      writtenRef.current?.savedAt === lastSaved
    ) {
      return;
    }
    writtenRef.current = { username, id: draftId, savedAt: lastSaved };
    writeAutosavePointer(username, draftId, lastSaved.getTime());
  }, [draftId, lastSaved, username]);

  /**
   * Forget the pointer this composer wrote, once its post is published. Reads a
   * ref, not render state: the publish flow holds a callback made when it
   * started, possibly before the first autosave had created the draft.
   */
  const forgetPointer = useCallback(() => {
    forgottenRef.current = true;
    const written = writtenRef.current;
    if (written) {
      clearAutosavePointer(written.username, written.id);
    }
  }, []);

  // Declared after the write above, so in the commit that carries the reset the
  // write still sees the flag; the reset itself drops lastSaved on the next render,
  // and the autosave engine abandons any save of the old post from then on.
  useEffect(() => {
    forgottenRef.current = false;
  }, [clearGeneration]);

  return { ...autosave, forgetPointer };
}

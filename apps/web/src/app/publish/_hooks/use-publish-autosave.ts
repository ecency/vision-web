import { useEffect, useMemo } from "react";
import { usePublishState } from "./use-publish-state";
import { useDraftAutosave } from "./use-draft-autosave";
import { hasDraftableContent } from "../_utils/content";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { writeAutosavePointer } from "../_utils/autosave-pointer";

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
  useEffect(() => {
    if (username && draftId && lastSaved) {
      writeAutosavePointer(username, draftId, lastSaved.getTime());
    }
  }, [draftId, lastSaved, username]);

  return autosave;
}

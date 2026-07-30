import { useMemo } from "react";
import { usePublishState } from "./use-publish-state";
import { useDraftAutosave } from "./use-draft-autosave";
import { useActiveAccount } from "@/core/hooks/use-active-account";

/**
 * Auto-saves the publish page into a draft whenever the post changes. The
 * first save creates the draft, every later one updates it.
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
    decentMemes
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

  return useDraftAutosave({
    enabled: !!activeUser?.username && !!(title?.trim() || content?.trim()),
    snapshot
  });
}

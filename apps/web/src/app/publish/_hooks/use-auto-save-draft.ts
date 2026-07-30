"use client";

import { useMemo } from "react";
import { usePublishState } from "./use-publish-state";
import { useDraftAutosave } from "./use-draft-autosave";
import { hasDraftableContent } from "../_utils/content";
import { useActiveAccount } from "@/core/hooks/use-active-account";

/**
 * Auto-saves an existing draft while it is being edited.
 */
export function useAutoSavePublishDraft(step: string, draftId?: string) {
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
    location
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
      location
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
      location
    ]
  );

  return useDraftAutosave({
    draftId,
    // The active-user check is new here: without it every attempt threw
    // "[Draft] No active user" and counted towards the circuit breaker.
    enabled:
      step === "edit" && !!activeUser?.username && hasDraftableContent(title, content),
    snapshot
  });
}

import { Draft } from "@ecency/sdk";
import { useCallback } from "react";
import { normalizePollSnapshot } from "../_utils/poll";
import { usePublishState } from "./use-publish-state";

export function useApplyTemplate(setEditorContent?: (content: string | undefined) => void) {
  const {
    clearAll,
    setTitle,
    setContent,
    setTags,
    setLocation,
    setReward,
    setBeneficiaries,
    loadMetaDescription,
    setSelectedThumbnail,
    setEntryImages,
    setPoll,
    setAppliedTemplateBody
  } = usePublishState();

  return useCallback(
    (draft: Draft) => {
      clearAll();
      setTitle(draft.title);
      setContent(draft.body);
      setTags(draft.tags_arr ?? []);

      setEditorContent?.(draft.body);
      setLocation(draft.meta?.location);
      setReward(draft.meta?.rewardType ?? "default");
      setBeneficiaries(draft.meta?.beneficiaries ?? []);
      loadMetaDescription(draft.meta?.description ?? "", draft.body);
      setSelectedThumbnail(draft.meta?.image?.[0] ?? "");
      setEntryImages(draft.meta?.image ?? []);
      setPoll(normalizePollSnapshot(draft.meta?.poll));
      setAppliedTemplateBody(draft.body);
    },
    [
      clearAll,
      setTitle,
      setContent,
      setTags,
      setEditorContent,
      setLocation,
      setReward,
      setBeneficiaries,
      loadMetaDescription,
      setSelectedThumbnail,
      setEntryImages,
      setPoll,
      setAppliedTemplateBody
    ]
  );
}

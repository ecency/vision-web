"use client";

import "../../page.scss";

import {
  PublishActionBar,
  PublishEditor,
  PublishModeHeader,
  PublishValidatePost,
  PublishMultiTabWarning
} from "@/app/publish/_components";
import { usePublishEditor, usePublishState, useAutoSavePublishDraft } from "@/app/publish/_hooks";
import { useApiDraftDetector } from "@/app/submit/_hooks";
import i18next from "i18next";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { normalizePollSnapshot } from "@/app/publish/_utils/poll";
import { PublishEditorHtmlWarning } from "../../_components/publish-editor-html-warning";
import { PublishSuccessState } from "../../_components/publish-success-state";
import { PublishDraftsNoDraft } from "./_components";

export default function PublishPage() {
  const params = useParams();
  const router = useRouter();
  const draftId = params?.id as string | undefined;

  const [step, setStep] = useState<"edit" | "validation" | "scheduled" | "published" | "no-draft">(
    "edit"
  );
  const [publishedEntry, setPublishedEntry] = useState<{ title: string; author: string; permlink: string; category: string } | undefined>();
  const [showHtmlWarning, setShowHtmlWarning] = useState(false);

  const { editor, setEditorContent } = usePublishEditor(() => setShowHtmlWarning(true));
  const {
    setTitle,
    setContent,
    setTags,
    setLocation,
    setReward,
    setBeneficiaries,
    setMetaDescription,
    setSelectedThumbnail,
    setEntryImages,
    setPoll,
    setDecentMemes,
    setAiTools,
    clearAll
  } = usePublishState();

  // Until this flips, publish state is the empty initial state rather than the
  // draft's content, and any write would store that emptiness over the draft.
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);

  useApiDraftDetector(
    params?.id as string,
    (draft) => {
      clearAll();
      setTitle(draft.title);
      setContent(draft.body);
      setTags(draft.tags_arr);

      setEditorContent(draft.body);
      setLocation(draft.meta?.location);
      setReward(draft.meta?.rewardType ?? "default");
      setBeneficiaries(draft.meta?.beneficiaries ?? []);
      setMetaDescription(draft.meta?.description ?? "");
      setSelectedThumbnail(draft.meta?.image?.[0] ?? "");
      setEntryImages(draft.meta?.image ?? []);
      setPoll(normalizePollSnapshot(draft.meta?.poll));
      setDecentMemes(draft.meta?.decentMemes ?? []);
      setAiTools(draft.meta?.ai_tools ?? {});
      setIsDraftLoaded(true);
    },
    () => setStep("no-draft")
  );
  const { lastSaved, isActiveTab, flush } = useAutoSavePublishDraft(step, draftId);

  // The classic editor reloads this draft from the server, so anything typed
  // inside the 10s debounce or the 60s throttle window would be dropped on the
  // way out. Flush first, and stay put if that fails rather than navigating to
  // a copy that is knowingly behind - useSaveDraftApi surfaces the error.
  const backToClassic = useCallback(async () => {
    // Nothing has reached the editor yet, so there is nothing to carry over -
    // and flushing here would write the empty initial state over the draft's
    // stored content. The classic editor loads the draft itself anyway.
    if (isDraftLoaded) {
      try {
        await flush();
      } catch {
        return;
      }
    }

    router.push(`/draft/${params?.id}`);
  }, [flush, isDraftLoaded, params?.id, router]);

  return (
    <>
      <PublishMultiTabWarning isActiveTab={isActiveTab} />
      {step === "edit" && (
        <>
          <PublishModeHeader label={i18next.t("publish.draft-mode")} lastSaved={lastSaved} />
          <PublishActionBar
            onPublish={() => setStep("validation")}
            onBackToClassic={backToClassic}
            setEditorContent={setEditorContent}
            draftId={draftId}
            saveDraft={flush}
          />
          <PublishEditor editor={editor} />
        </>
      )}
      {step === "validation" && (
        <PublishValidatePost
          onClose={() => setStep("edit")}
          onSuccess={(step, entryInfo) => {
            setPublishedEntry(entryInfo);
            setStep(step);
          }}
        />
      )}
      {["scheduled", "published"].includes(step) && (
        <PublishSuccessState
          step={step as "published" | "scheduled"}
          setEditStep={() => setStep("edit")}
          entryInfo={publishedEntry}
        />
      )}
      {step === "no-draft" && <PublishDraftsNoDraft />}
      <PublishEditorHtmlWarning show={showHtmlWarning} setShow={setShowHtmlWarning} />
    </>
  );
}

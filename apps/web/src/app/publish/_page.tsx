"use client";

import {
  PublishActionBar,
  PublishModeHeader,
  PublishValidatePost,
  PublishMultiTabWarning
} from "@/app/publish/_components";
import {
  useBackToClassic,
  useOpenAutosavedDraft,
  usePublishAutosave,
  usePublishEditor,
  usePublishHandoff,
  usePublishState
} from "@/app/publish/_hooks";
import type { ImportResult } from "@/app/publish/_components/publish-import-dialog";
import { isCommunity } from "@/utils";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import i18next from "i18next";
import { PublishEditorHtmlWarning } from "./_components/publish-editor-html-warning";
import { PublishSuccessState } from "./_components/publish-success-state";
import dynamic from "next/dynamic";

function EditorLoadingFallback() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="text-gray-500">{i18next.t("publish.loading-editor")}</div>
    </div>
  );
}

const PublishEditor = dynamic(
  () => import("@/app/publish/_components/publish-editor").then((m) => ({ default: m.PublishEditor })),
  {
    ssr: false,
    loading: EditorLoadingFallback
  }
);

export default function Publish() {
  const [step, setStep] = useState<"edit" | "validation" | "scheduled" | "published">("edit");
  const [publishedEntry, setPublishedEntry] = useState<{ title: string; author: string; permlink: string; category: string } | undefined>();
  const [showHtmlWarning, setShowHtmlWarning] = useState(false);

  const { editor, setEditorContent } = usePublishEditor(() => setShowHtmlWarning(true));
  const searchParams = useSearchParams();
  const { tags, setTags, setTitle, setContent, setSelectedThumbnail } = usePublishState();

  const handleImport = useCallback(
    (result: ImportResult) => {
      setTitle(result.title);
      setContent(result.content);
      setEditorContent(result.content);
      setSelectedThumbnail(result.thumbnail || "");
      setTags(result.tags ?? []);
    },
    [setTitle, setContent, setEditorContent, setSelectedThumbnail, setTags]
  );
  const appliedCommunityRef = useRef<string | null>(null);

  // A wave or deck thread that outgrew its character limit stages its content
  // here and opens this page. setContent alone is not enough: the editor
  // prefills itself from publish state only if it initialises after this runs,
  // so seed both and let whichever lands second win with the same value.
  usePublishHandoff(
    useCallback(
      (body: string) => {
        setContent(body);
        setEditorContent(body);
      },
      [setContent, setEditorContent]
    )
  );

  const { isActiveTab, lastSaved, draftId } = usePublishAutosave();
  const backToClassic = useBackToClassic();
  const { openDraft, isOpening } = useOpenAutosavedDraft(draftId);

  useEffect(() => {
    const communityParam = searchParams?.get("com");

    if (!communityParam || !isCommunity(communityParam)) {
      appliedCommunityRef.current = null;
      return;
    }

    const normalizedCommunity = communityParam.toLowerCase();

    if (appliedCommunityRef.current === normalizedCommunity) {
      return;
    }

    if (tags?.[0]?.toLowerCase() === normalizedCommunity) {
      appliedCommunityRef.current = normalizedCommunity;
      return;
    }

    const remainingTags = (tags ?? [])
      .filter((tag) => tag.toLowerCase() !== normalizedCommunity)
      .filter((tag) => !isCommunity(tag));

    setTags([normalizedCommunity, ...remainingTags]);
    appliedCommunityRef.current = normalizedCommunity;
  }, [searchParams, setTags, tags]);

  return (
    <>
      <PublishMultiTabWarning isActiveTab={isActiveTab} />
      {step === "edit" && (
        <>
          {/* Guard on draftId so the auto-saved time only shows once a draft
              actually exists on the server, matching the prior action-bar logic
              (`lastSaved && draftId`). */}
          <PublishModeHeader
            label={i18next.t("publish.new-content")}
            lastSaved={draftId ? lastSaved : null}
            onOpenDraft={draftId ? openDraft : undefined}
            isOpeningDraft={isOpening}
          />
          <PublishActionBar
            onPublish={() => setStep("validation")}
            onBackToClassic={backToClassic}
            onImport={handleImport}
            setEditorContent={setEditorContent}
            draftId={draftId}
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

      <PublishEditorHtmlWarning show={showHtmlWarning} setShow={setShowHtmlWarning} />
    </>
  );
}

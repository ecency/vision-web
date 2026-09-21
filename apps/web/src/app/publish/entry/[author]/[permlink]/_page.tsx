"use client";

import { PublishEditor, PublishModeHeader } from "@/app/publish/_components";
import { usePublishEditor, usePublishState } from "@/app/publish/_hooks";
import { useEntryDetector } from "@/app/submit/_hooks";
import { Entry } from "@/entities";
import { metaStringList } from "@/utils";
import i18next from "i18next";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { normalizePollSnapshot } from "@/app/publish/_utils/poll";
import { useEntryPollExtractor } from "@/features/polls";
import {
  PublishEntryActionBar,
  PublishEntryLoadingPost,
  PublishEntryNoPost,
  PublishEntrySuccessState,
  PublishEntryValidateEdit
} from "./_components";
import { PublishEditorHtmlWarning } from "@/app/publish/_components/publish-editor-html-warning";

export default function Publish() {
  const params = useParams();

  const [step, setStep] = useState<"loading" | "edit" | "no-post" | "validation" | "updated">(
    "loading"
  );
  const [entry, setEnrty] = useState<Entry>();
  const [showHtmlWarning, setShowHtmlWarning] = useState(false);

  const { editor, setEditorContent } = usePublishEditor(() => setShowHtmlWarning(true));

  const {
    setTitle,
    setContent,
    setTags,
    loadMetaDescription,
    setSelectedThumbnail,
    setLocation,
    setEntryImages,
    setPoll,
    clearAll
  } = usePublishState();

  const entryPoll = useEntryPollExtractor(entry);

  useEffect(() => {
    setPoll(normalizePollSnapshot(entryPoll));
  }, [entryPoll, setPoll]);

  useEntryDetector(
    (params?.author as string).replace(/%40/g, ""),
    params?.permlink as string,
    async (entry) => {
      if (entry) {
        clearAll();
        setEnrty(entry);
        setStep("edit");
        setTitle(entry.title);
        setTags(Array.from(new Set(metaStringList(entry.json_metadata?.tags))));
        setContent(entry.body); // todo
        // A published post carries its own generated summary, so hand the body over with it:
        // a description that is that summary keeps following the body as the author edits.
        loadMetaDescription(entry.json_metadata?.description ?? "", entry.body);
        // Read through metaStringList: a bare-string `image` indexes to its first
        // CHARACTER here, and spreads into one entry per character below.
        const metaImages = metaStringList(entry.json_metadata?.image);
        if (metaImages.length > 0) {
          setSelectedThumbnail(metaImages[0]);
          setEntryImages(Array.from(new Set(metaImages)));
        }
        entry?.json_metadata?.location && setLocation(entry?.json_metadata?.location);

        setEditorContent(entry.body);
      } else {
        clearAll();
        setStep("no-post");
      }
    }
  );

  return (
    <>
      {step === "edit" && (
        <>
          <PublishModeHeader label={i18next.t("publish.edit-mode")} />
          <PublishEntryActionBar entry={entry} onEdit={() => setStep("validation")} />
          <PublishEditor editor={editor} allowToUploadVideo={false} />
        </>
      )}
      {step === "validation" && (
        <PublishEntryValidateEdit
          entry={entry}
          onClose={() => setStep("edit")}
          onSuccess={(step) => setStep(step)}
        />
      )}
      {step === "no-post" && <PublishEntryNoPost />}
      {step === "loading" && <PublishEntryLoadingPost />}
      {step === "updated" && <PublishEntrySuccessState entry={entry} />}
      <PublishEditorHtmlWarning show={showHtmlWarning} setShow={setShowHtmlWarning} />
    </>
  );
}

"use client";

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import "./_index.scss";
import { BeneficiaryRoute, Entry, WaveEntry } from "@/entities";
import { PollsContext, PollsManager, useEntryPollExtractor } from "@/features/polls";
import { useLocalStorage } from "react-use";
import { PREFIX } from "@/utils/local-storage";
import { ProfileLink, UserAvatar } from "@/features/shared";
import { QuestStreakChip } from "@/features/shared/quest-streak-chip";
import { WaveFormControl } from "./wave-form-control";
import i18next from "i18next";
import { Button } from "@ui/button";
import { sendSvg } from "@ui/svg";
import { useIsMobile } from "@/features/ui/util/use-is-mobile";
import { WaveFormToolbar } from "@/features/waves/components/wave-form/wave-form-toolbar";
import { useWaveSubmit } from "@/features/waves";
import axios from "axios";
import { QUEST_MIN_CONTENT_LENGTH, uploadImage } from "@ecency/sdk";
import { shouldShowShortContentHint } from "@/utils/short-content-hint";
import { ensureValidToken } from "@/utils";
import { error } from "@/features/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { useActiveAccount } from "@/core/hooks";
import { useGlobalStore } from "@/core/global-store";
import { VideoUpload } from "@/features/shared/video-upload-threespeak";

interface Props {
  className?: string;
  placeholder?: string;
  replySource?: Entry;
  onSuccess?: (reply: Entry) => void;
  hideAvatar?: boolean;
  entry: WaveEntry | undefined;
}

const WaveFormComponent = ({
  placeholder,
  replySource,
  onSuccess,
  hideAvatar = false,
  entry
}: Props) => {
  const { username: activeUsername, account, isLoading: isAccountLoading } = useActiveAccount();
  const toggleUIProp = useGlobalStore((s) => s.toggleUiProp);
  const isMobile = useIsMobile();

  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { clearActivePoll, setActivePoll } = useContext(PollsContext);

  // Waves always publish to an Ecency-owned waves container (never third-party
  // containers), even though the feed is unified across all of them. This is the
  // requested host; use-wave-create resolves the real container at submit time,
  // preferring hive.flow over ecency.waves (see ECENCY_WAVES_HOSTS).
  const [threadHost] = useLocalStorage(PREFIX + "_wf_th", "ecency.waves");
  const [text, setText, clearText] = useLocalStorage(PREFIX + "_wf_t", "");
  const [image, setImage, clearImage] = useLocalStorage<string>(PREFIX + "_wf_i", "");
  const [imageName, setImageName, clearImageName] = useLocalStorage<string>(PREFIX + "_wf_in", "");
  // When the current image is a DecentMemes meme, keep its template + beneficiary
  // data alongside the image URL. The `imageUrl` guard means that if the image is
  // later replaced (regular picker / AI), the stale meme data is ignored at submit.
  const [decentMemes, setDecentMemes, clearDecentMemes] = useLocalStorage<{
    templateIds: string[];
    beneficiaries: BeneficiaryRoute[];
    imageUrl: string;
  } | null>(PREFIX + "_wf_dm", null);
  const [video, setVideo, clearVideo] = useLocalStorage<string>(PREFIX + "_wf_v", "");
  const [videoThumbnail, setVideoThumbnail, clearVideoThumbnail] = useLocalStorage<string>(
    PREFIX + "_wf_vt",
    ""
  );
  const [showVideoUpload, setShowVideoUpload] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const hasAppliedSharedText = useRef(false);

  const entryDepth = entry?.depth;
  const entryParentAuthor = entry?.parent_author;
  const isReply = useMemo(
    () => Boolean(replySource || entryDepth || entryParentAuthor),
    [entryDepth, entryParentAuthor, replySource]
  );
  const characterLimit = isReply ? 750 : 250;
  const textLength = text?.length ?? 0;
  const exceedsCharacterLimit = textLength > characterLimit;

  // A wave is a comment on the chain, so the points backend applies the same minimum
  // length to it as to a reply, silently. Waves are short by design, which is exactly why
  // it bites here. Not gated on `isReply`: a reply to a wave is a comment too and earns
  // on the same rule.
  const showShortContentHint = shouldShowShortContentHint({
    username: activeUsername,
    isEditing: !!entry,
    text
  });

  const poll = useEntryPollExtractor(entry);
  useEffect(() => {
    if (poll) {
      setActivePoll(poll);
    }
  }, [poll, setActivePoll]);

  useEffect(() => {
    if (entry) {
      const body = entry.body ?? "";
      let nextText = body.replace(/<br\s*\/?>(\n)?/gi, "\n").replace(/<\/?p[^>]*>/gi, "");
      const nextImage = entry.body.match(/\!\[.*\]\(.+\)/g)?.[0];
      if (nextImage) {
        setImage(
          nextImage
            .replace(/\!\[.*\]/g, "")
            .replace("(", "")
            .replace(")", "")
        );
        nextText = nextText.replace(nextImage, "");
      }
      setText(nextText);
    }
  }, [entry, setImage, setText]);

  useEffect(() => {
    if (entry || hasAppliedSharedText.current) {
      return;
    }

    const sharedText = searchParams?.get("text")?.trim();

    if (!sharedText) {
      return;
    }

    setText(sharedText);
    hasAppliedSharedText.current = true;
    router.replace("/waves");
  }, [entry, router, searchParams, setText]);

  const clear = useCallback(() => {
    setText("");
    clearImage();
    clearImageName();
    clearDecentMemes();
    clearActivePoll();
    clearVideo();
    clearVideoThumbnail();
  }, [
    clearActivePoll,
    clearImage,
    clearImageName,
    clearDecentMemes,
    clearVideo,
    clearVideoThumbnail,
    setText
  ]);

  const { mutateAsync: submit, isPending } = useWaveSubmit(entry, replySource, (item) => {
    clear();
    onSuccess?.(item);
  });

  const formInteractivityDisabled = isAccountLoading || isPending;

  const submitDisabled = useMemo(
    () => formInteractivityDisabled || !text || !threadHost || (isReply && exceedsCharacterLimit),
    [exceedsCharacterLimit, formInteractivityDisabled, isReply, text, threadHost]
  );

  const handleSubmit = useCallback(() => {
    if (submitDisabled) {
      return;
    }
    submit({
      text: text!!,
      imageName: imageName!!,
      image: image!!,
      host: threadHost!!,
      video: video!!,
      videoThumbnail: videoThumbnail!!,
      // Only attach meme data when the current image is still the meme.
      decentMemes:
        decentMemes && decentMemes.imageUrl === image && decentMemes.templateIds.length > 0
          ? {
              templateIds: decentMemes.templateIds,
              beneficiaries: decentMemes.beneficiaries
            }
          : undefined
    });
  }, [
    submitDisabled,
    submit,
    text,
    imageName,
    image,
    threadHost,
    video,
    videoThumbnail,
    decentMemes
  ]);

  // The action this button performs depends on auth/edit/length state. On mobile
  // the button collapses to a send icon, so this string drives its accessible
  // label/tooltip; on desktop it is the visible button text.
  const submitLabel = (() => {
    if (!activeUsername && !entry && !exceedsCharacterLimit) {
      return i18next.t("decks.threads-form.login-and-publish");
    }
    if (activeUsername && !replySource && !entry && !exceedsCharacterLimit) {
      return isPending
        ? i18next.t("decks.threads-form.publishing")
        : i18next.t("decks.threads-form.publish");
    }
    if (activeUsername && replySource && !entry && !exceedsCharacterLimit) {
      return isPending ? i18next.t("waves.replying") : i18next.t("waves.reply");
    }
    if (exceedsCharacterLimit && !entry && !isReply) {
      return i18next.t("decks.threads-form.create-regular-post");
    }
    if (entry) {
      return i18next.t("decks.threads-form.save");
    }
    return "";
  })();

  // Collapse to the compact send icon only for the normal publish/reply action
  // on mobile. Edit (save), over-limit (long post) and signed-out states keep
  // their visible text, since a send icon would misrepresent those actions.
  const useCompactSubmit = isMobile && !!activeUsername && !entry && !exceedsCharacterLimit;

  const handleEmojiPick = useCallback(
    (emoji: string) => {
      const input = textareaRef.current;
      const currentText = text ?? "";

      if (!input) {
        setText(`${currentText}${emoji}`);
        return;
      }

      const selectionStart = input.selectionStart ?? currentText.length;
      const selectionEnd = input.selectionEnd ?? selectionStart;

      const nextValue =
        currentText.slice(0, selectionStart) + emoji + currentText.slice(selectionEnd);

      setText(nextValue);

      const restoreCaret = () => {
        const caretPosition = selectionStart + emoji.length;
        input.setSelectionRange(caretPosition, caretPosition);
        input.focus();
      };

      if (typeof window !== "undefined") {
        window.requestAnimationFrame(restoreCaret);
      } else {
        restoreCaret();
      }
    },
    [setText, text]
  );

  const handlePasteImage = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const clipboardData = event.clipboardData;

      if (!clipboardData) {
        return;
      }

      const pastedText = clipboardData.getData("text/plain");

      if (pastedText && pastedText.length >= 50) {
        return;
      }

      const files = Array.from(clipboardData.items ?? [])
        .map((item) => (item.type.includes("image") ? item.getAsFile() : null))
        .filter((file): file is File => Boolean(file));

      if (!files.length) {
        return;
      }

      if (!activeUsername) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      void (async () => {
        const token = await ensureValidToken(activeUsername);

        if (!token) {
          error(i18next.t("editor-toolbar.image-error-cache"));
          return;
        }

        for (const file of files) {
          try {
            const { url } = await uploadImage(file, token);
            setImage(url);
            setImageName(file.name);
            break;
          } catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 413) {
              error(i18next.t("editor-toolbar.image-error-size"), undefined, { error: err });
            } else {
              error(i18next.t("editor-toolbar.image-error"), undefined, { error: err });
            }
            break;
          }
        }
      })();
    },
    [activeUsername, setImage, setImageName]
  );

  return (
    <div ref={rootRef} className="wave-form relative flex items-start px-4 py-3 w-full">
      {!hideAvatar && activeUsername && (
        <UserAvatar username={activeUsername} size={replySource ? "deck-item" : "medium"} />
      )}
      <div className="pl-3 w-full">
        {replySource && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {i18next.t("waves.reply-form-title")}{" "}
            <ProfileLink className="text-blue-dark-sky" username={replySource.author}>
              @{replySource.author}
            </ProfileLink>
          </div>
        )}
        <WaveFormControl
          video={video}
          text={text!!}
          setText={setText}
          textareaRef={textareaRef}
          selectedImage={image}
          clearSelectedImage={clearImage}
          clearVideo={clearVideo}
          placeholder={placeholder}
          characterLimit={characterLimit}
          onPasteImage={formInteractivityDisabled ? undefined : handlePasteImage}
          disabled={formInteractivityDisabled}
        />
        {isAccountLoading && (
          <div className="text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
            {i18next.t("g.loading")}...
          </div>
        )}

        <QuestStreakChip className="mb-1.5" />

        {showShortContentHint && (
          <div className="mb-1.5 text-xs opacity-60" role="status">
            {i18next.t("waves.short-content-hint", { n: QUEST_MIN_CONTENT_LENGTH })}
          </div>
        )}

        <WaveFormToolbar
          isEdit={!!entry}
          disabled={formInteractivityDisabled}
          suggestedPrompt={text?.trim() || undefined}
          hasVideo={!!video}
          onAddImage={(url, name) => {
            setImage(url);
            setImageName(name);
          }}
          onAddMeme={({ url, name, templateId, beneficiaries }) => {
            setImage(url);
            setImageName(name);
            setDecentMemes({
              templateIds: [templateId].filter(Boolean),
              beneficiaries,
              imageUrl: url
            });
          }}
          onEmojiPick={handleEmojiPick}
          onAddVideo={setVideo}
          onShowVideoUpload={() => {
            if (!activeUsername) {
              toggleUIProp("login");
              return;
            }
            setShowVideoUpload(true);
          }}
          submit={
            useCompactSubmit ? (
              <Button
                onClick={handleSubmit}
                disabled={submitDisabled}
                isLoading={isPending}
                className="justify-self-end"
                size="sm"
                icon={sendSvg}
                aria-label={submitLabel || i18next.t("decks.threads-form.publish")}
                title={submitLabel || i18next.t("decks.threads-form.publish")}
              />
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={submitDisabled}
                isLoading={isPending}
                className="justify-self-end"
                size="sm"
              >
                {submitLabel}
              </Button>
            )
          }
        />
        <VideoUpload
          show={showVideoUpload}
          setShow={setShowVideoUpload}
          isShort={true}
          onVideoUploaded={(embedUrl, thumbnailUrl) => {
            setVideo(embedUrl);
            setVideoThumbnail(thumbnailUrl ?? "");
          }}
        />
      </div>
    </div>
  );
};

export function WaveForm(props: Props) {
  return (
    <PollsManager>
      <WaveFormComponent {...props} />
    </PollsManager>
  );
}

export * from "./wave-form-loading";

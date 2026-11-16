import React, { useContext } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { DeckThreadsFormToolbar } from "./deck-threads-form-toolbar";
import { PollsContext, PollWidget } from "@/features/polls";
import i18next from "i18next";
import { closeSvg } from "@ui/svg";
import Image from "next/image";

interface Props {
  text: string;
  setText: (v: string) => void;
  video: string | undefined;
  selectedImage: string | undefined;
  onClearImage: () => void;
  onAddImage: (url: string, name: string) => void;
  onAddVideo: (value: string | undefined) => void;
  placeholder?: string;
  onTextareaFocus: () => void;
}

export const DeckThreadsFormControl = ({
  text,
  setText,
  onAddImage,
  selectedImage,
  onClearImage,
  placeholder,
  onTextareaFocus,
  onAddVideo,
  video
}: Props) => {
  const { activePoll } = useContext(PollsContext);

  // The video markup may not match, in which case there is no thumbnail to show.
  const videoThumbnail = (
    (video ? /<center>\[!\[](.*)].*<\/center>/.exec(video)?.[1] : undefined) ?? ""
  )
    .replace("(", "")
    .replace(")", "");

  return (
    <>
      <div className="comment-body">
        <div className="editor">
          <TextareaAutosize
            className="editor-control"
            placeholder={placeholder ?? i18next.t("decks.threads-form.input-placeholder")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={onTextareaFocus}
          />
          <div className="length-prompt">{text?.length}/250</div>
        </div>
        {selectedImage && (
          <div className="deck-threads-form-selected-image border border-[--border-color] my-3">
            <div className="type">image</div>
            <Image width={1000} height={1000} src={selectedImage} alt="" />
            <div
              className="remove [&>svg]:size-4"
              role="button"
              tabIndex={0}
              aria-label={i18next.t("g.delete", { defaultValue: "Remove" })}
              onClick={() => onClearImage()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClearImage();
                }
              }}
            >
              {closeSvg}
            </div>
          </div>
        )}
        {video && (
          <div className="deck-threads-form-selected-image border border-[--border-color] my-3">
            <div className="type">video</div>
            {videoThumbnail && <Image width={1000} height={1000} src={videoThumbnail} alt="" />}
            <div
              className="remove [&>svg]:size-4"
              role="button"
              tabIndex={0}
              aria-label={i18next.t("g.delete", { defaultValue: "Remove" })}
              onClick={() => onAddVideo(undefined)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onAddVideo(undefined);
                }
              }}
            >
              {closeSvg}
            </div>
          </div>
        )}
        {activePoll && (
          <div className="py-4">
            <PollWidget compact={true} poll={activePoll} isReadOnly={true} />
          </div>
        )}
        <DeckThreadsFormToolbar
          onAddImage={onAddImage}
          onEmojiPick={(v) => setText(`${text}${v}`)}
          onAddVideo={onAddVideo}
        />
      </div>
    </>
  );
};

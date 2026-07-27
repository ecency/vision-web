"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import { useMountedState } from "react-use";
import { v4 } from "uuid";
import { codeTagsSvg, emoticonHappyOutlineSvg, formatBoldSvg, formatItalicSvg, formatListBulletedSvg, formatListNumberedSvg, formatQuoteCloseSvg, formatTitleSvg, gifIcon, gridSvg, imageSvg, textShortSvg, videoSvg } from "@/assets/img/svg";
import "./_index.scss";
import { UilPanelAdd } from "@tooni/iconscout-unicons-react";
import { PollsCreation, PollSnapshot } from "@/features/polls";
import { useIsMobile } from "@/features/ui/util/use-is-mobile";
import { useUploadImageMutation } from "@/api/sdk-mutations";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { insertOrReplace, replace } from "@/utils";
import { convertHeicToJpeg } from "@/utils/convert-heic";
import { isAcceptedImageFilename } from "@/utils/image-upload-formats";
import { Tooltip } from "@ui/tooltip";
import i18next from "i18next";
import { EmojiPicker } from "@ui/emoji-picker/lazy-emoji-picker";
import { GifPicker } from "@ui/gif-picker";
import { classNameObject } from "@ui/util";
import { GalleryDialog } from "@/features/shared/gallery";
import { FragmentsDialog } from "@/features/shared/fragments";
import { VideoUpload } from "@/features/shared/video-upload-threespeak";
import { AddImage } from "@/features/shared/editor-toolbar/add-image";
import { AddLink } from "@/features/shared/editor-toolbar/add-link";
import { AddImageMobile } from "@/features/shared/editor-toolbar/add-image-mobile";
import useMount from "react-use/lib/useMount";
import { EcencyConfigManager } from "@/config";
// Import directly from the file, NOT the "@/app/publish/_hooks" barrel:
// the barrel re-exports use-publish-editor (the full TipTap/ProseMirror graph,
// ~400KB), so importing the tracker through it drags the entire editor into
// every editor-toolbar consumer — including the read-only entry page. The
// tracker itself only depends on React.
import { useOptionalUploadTracker } from "@/app/publish/_hooks/use-upload-tracker";
import { linkSvg } from "@ui/svg";

interface Props {
  sm?: boolean;
  comment: boolean;
  onVideoUploaded?: (embedUrl: string, thumbnailUrl?: string) => void;
  onAddPoll?: (poll: PollSnapshot) => void;
  existingPoll?: PollSnapshot;
  onDeletePoll?: () => void;
  readonlyPoll?: boolean;
}

export const detectEvent = (eventType: string) => {
  const ev = new Event(eventType);
  window.dispatchEvent(ev);
};

export const toolbarEventListener = (event: Event, eventType: string) => {
  const ev = new CustomEvent("customToolbarEvent", { detail: { event, eventType } });
  window.dispatchEvent(ev);
};

export function EditorToolbar({
  sm,
  comment,
  onVideoUploaded,
  onAddPoll,
  existingPoll,
  onDeletePoll,
  readonlyPoll
}: Props) {
  const { activeUser } = useActiveAccount();
  const activeUserRef = useRef(activeUser);

  const isMobile = useIsMobile();

  const rootRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const emojiButtonRef = useRef<HTMLDivElement | null>(null);

  const [gallery, setGallery] = useState(false);
  const [fragments, setFragments] = useState(false);
  const [image, setImage] = useState(false);
  const [link, setLink] = useState(false);
  const [mobileImage, setMobileImage] = useState(false);
  const [gif, setGif] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const [showVideoUpload, setShowVideoUpload] = useState(false);
  const [showPollsCreation, setShowPollsCreation] = useState(false);

  const toolbarId = useMemo(() => v4(), []);
  const headers = useMemo(() => Array.from(new Array(3).keys()), []);

  const uploadImage = useUploadImageMutation();
  const uploadTracker = useOptionalUploadTracker();
  const uploadQueueRef = useRef<Promise<void | undefined>>(Promise.resolve());
  const isMounted = useMountedState();
  useEffect(() => {
    activeUserRef.current = activeUser;
  }, [activeUser]);

  useMount(() => {
    window.addEventListener("bold", bold);
    window.addEventListener("italic", italic);
    window.addEventListener("table", table);
    window.addEventListener("link", () => setLink(true));
    window.addEventListener("codeBlock", code);
    window.addEventListener("blockquote", quote);
    window.addEventListener("image", () => setImage(true));
    // 🆕 Native drag-drop listeners on the editor
    const editor = rootRef.current?.parentElement?.querySelector(".the-editor");

    if (editor) {
      editor.addEventListener("dragover", (e) => onDragOver(e as DragEvent));
      editor.addEventListener("drop", (e) => drop(e as DragEvent));
      editor.addEventListener("paste", (e) => onPaste(e as ClipboardEvent));
    }

    return () => {
      window.removeEventListener("bold", bold);
      window.removeEventListener("italic", italic);
      window.removeEventListener("table", table);
      window.removeEventListener("link", () => setLink(true));
      window.removeEventListener("codeBlock", code);
      window.removeEventListener("blockquote", quote);
      window.removeEventListener("image", () => setImage(true));

      if (editor) {
        editor.removeEventListener("dragover", (e) => onDragOver(e as DragEvent));
        editor.removeEventListener("drop", (e) => drop(e as DragEvent));
        editor.removeEventListener("paste", (e) => onPaste(e as ClipboardEvent));
      }
    };
  });

  const getTargetEl = () => {
    const root = rootRef.current;
    if (!root || !root.parentElement) {
      return null;
    }

    return root.parentElement.querySelector(".the-editor") as HTMLInputElement;
  };

  const insertText = (before: string, after: string = "") => {
    const el = getTargetEl();
    if (el) {
      insertOrReplace(el, before, after);
    }
    return getTargetEl();
  };

  const replaceText = (find: string, rep: string) => {
    const el = getTargetEl();
    if (el) {
      replace(el, find, rep);
    }
  };

  const bold = () => insertText("**", "**");
  const italic = () => insertText("*", "*");
  const header = (w: number) => insertText(`${"#".repeat(w)} `);
  const code = () => insertText("<code>", "</code>");
  const quote = () => insertText(">");
  const ol = () => insertText("1. item1\n2. item2\n3. item3");
  const ul = () => insertText("* item1\n* item2\n* item3");
  const insertLink = (text: string, url: string) => insertText(`[${text}`, `](${url})`);
  const insertImage = (text: string, url: string) => insertText(`![${text}`, `](${url})`);

  const table = (e: React.SyntheticEvent<HTMLElement> | Event) => {
    e.stopPropagation();
    const t =
      "\n|\tColumn 1\t|\tColumn 2\t|\tColumn 3\t|\n" +
      "|\t------------\t|\t------------\t|\t------------\t|\n" +
      "|\t     Text     \t|\t     Text     \t|\t     Text     \t|\n";
    insertText(t);
  };

  const table1 = (e: React.SyntheticEvent<HTMLElement>) => {
    e.stopPropagation();

    const t = "\n|\tColumn 1\t|\n" + "|\t------------\t|\n" + "|\t     Text     \t|\n";
    insertText(t);
  };

  const table2 = (e: React.SyntheticEvent<HTMLElement>) => {
    e.stopPropagation();
    const t =
      "\n|\tColumn 1\t|\tColumn 2\t|\n" +
      "|\t------------\t|\t------------\t|\n" +
      "|\t     Text     \t|\t     Text     \t|\n";
    insertText(t);
  };

  const fileInputChanged = (e: React.ChangeEvent<HTMLInputElement>): void => {
    let files = Array.from(e.target.files as FileList)
      .filter((i) => checkFile(i.name))
      .filter((i) => i);

    if (files.length > 0) {
      e.stopPropagation();
      e.preventDefault();
    }

    files.forEach((file) => enqueueUpload(file));

    // reset input
    e.target.value = "";
  };

  const enqueueUpload = (file: File) => {
    const tempImgTag = `![Uploading ${file.name} #${Math.floor(Math.random() * 99)}]()\n\n`;
    insertText(tempImgTag);

    // Register upload with tracker
    const uploadId = `toolbar-${Date.now()}-${Math.random()}`;
    const abortController = new AbortController();
    uploadTracker?.registerUpload(uploadId, abortController);

    uploadQueueRef.current = uploadQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const convertedFile = await convertHeicToJpeg(file);
          const { url } = await uploadImage.mutateAsync({ file: convertedFile, signal: abortController.signal });
          uploadTracker?.markComplete(uploadId);
          const imgTag = url.length > 0 && `![](${url})\n\n`;
          imgTag ? replaceText(tempImgTag, imgTag) : replaceText(tempImgTag, "");
        } catch {
          uploadTracker?.markFailed(uploadId);
          replaceText(tempImgTag, "");
        }
      });
  };

  const checkFile = (filename: string) => isAcceptedImageFilename(filename);

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!activeUserRef.current) {
      return;
    }

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const drop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!e.dataTransfer || !activeUserRef.current) {
      return;
    }

    const files = Array.from(e.dataTransfer.files)
      .filter((i) => checkFile(i.name))
      .filter((i) => i);

    if (files.length > 0) {
      files.forEach((file) => enqueueUpload(file));
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    if (!e.clipboardData) {
      return;
    }

    // when text copied from ms word, it adds screenshot of selected text to clipboard.
    // check if data in clipboard is long string and skip upload.
    // (i think no one uses more than 50 chars for a image file)
    const txtData = e.clipboardData.getData("text/plain");
    if (txtData.length >= 50) {
      return;
    }

    const files = Array.from(e.clipboardData.items)
      .map((item) => (item.type.indexOf("image") !== -1 ? item.getAsFile() : null))
      .filter((i) => i);

    if (files.length > 0) {
      e.stopPropagation();
      e.preventDefault();

      files.forEach((file) => {
        if (!file) {
          return;
        }

        enqueueUpload(file);
      });
    }
  };

  return (
    <>
      <div
        id="editor-toolbar"
        className={
          sm ? "editor-toolbar toolbar-sm [&_svg]:size-4" : "editor-toolbar [&_svg]:size-5"
        }
        ref={rootRef}
      >
        <Tooltip content={i18next.t("editor-toolbar.bold")}>
          <div
            className="editor-tool"
            role="button"
            tabIndex={0}
            aria-label={i18next.t("editor-toolbar.bold")}
            onClick={bold}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                bold();
              }
            }}
          >
            {formatBoldSvg}
          </div>
        </Tooltip>
        <Tooltip content={i18next.t("editor-toolbar.italic")}>
          <div
            className="editor-tool"
            role="button"
            tabIndex={0}
            aria-label={i18next.t("editor-toolbar.italic")}
            onClick={italic}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                italic();
              }
            }}
          >
            {formatItalicSvg}
          </div>
        </Tooltip>
        <Tooltip content={i18next.t("editor-toolbar.header")}>
          <div
            className="editor-tool"
            role="button"
            tabIndex={0}
            aria-label={i18next.t("editor-toolbar.header")}
            onClick={() => header(1)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                header(1);
              }
            }}
          >
            {formatTitleSvg}
            <div className="sub-tool-menu">
              {headers.map((i) => (
                <div
                  key={i}
                  className="sub-tool-menu-item"
                  role="button"
                  tabIndex={0}
                  onClick={(e: React.MouseEvent<HTMLElement>) => {
                    e.stopPropagation();
                    header(i + 2);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      header(i + 2);
                    }
                  }}
                >
                  {`H${i + 2}`}
                </div>
              ))}
            </div>
          </div>
        </Tooltip>
        <div className="tool-separator" />
        <Tooltip content={i18next.t("editor-toolbar.code")}>
          <div
            className="editor-tool"
            role="button"
            tabIndex={0}
            aria-label={i18next.t("editor-toolbar.code")}
            onClick={code}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                code();
              }
            }}
          >
            {codeTagsSvg}
          </div>
        </Tooltip>
        <Tooltip content={i18next.t("editor-toolbar.quote")}>
          <div
            className="editor-tool"
            role="button"
            tabIndex={0}
            aria-label={i18next.t("editor-toolbar.quote")}
            onClick={quote}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                quote();
              }
            }}
          >
            {formatQuoteCloseSvg}
          </div>
        </Tooltip>
        <EcencyConfigManager.Conditional
          condition={({ visionFeatures }) => visionFeatures.fragments.enabled}
        >
          <Tooltip content={i18next.t("editor-toolbar.fragments")}>
            <div
              className="editor-tool"
              role="button"
              tabIndex={0}
              aria-label={i18next.t("editor-toolbar.fragments")}
              onClick={() => setFragments(!fragments)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setFragments(!fragments);
                }
              }}
            >
              {textShortSvg}
            </div>
          </Tooltip>
        </EcencyConfigManager.Conditional>
        <div className="tool-separator" />
        <Tooltip content={i18next.t("editor-toolbar.ol")}>
          <div
            className="editor-tool"
            role="button"
            tabIndex={0}
            aria-label={i18next.t("editor-toolbar.ol")}
            onClick={ol}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                ol();
              }
            }}
          >
            {formatListNumberedSvg}
          </div>
        </Tooltip>
        <Tooltip content={i18next.t("editor-toolbar.ul")}>
          <div
            className="editor-tool"
            role="button"
            tabIndex={0}
            aria-label={i18next.t("editor-toolbar.ul")}
            onClick={ul}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                ul();
              }
            }}
          >
            {formatListBulletedSvg}
          </div>
        </Tooltip>
        <Tooltip content={i18next.t("editor-toolbar.table")}>
          <div
            className="editor-tool"
            role="button"
            tabIndex={0}
            aria-label={i18next.t("editor-toolbar.table")}
            onClick={table}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                table(e);
              }
            }}
          >
            {gridSvg}
            <div className="sub-tool-menu">
              <div
                className="sub-tool-menu-item"
                role="button"
                tabIndex={0}
                onClick={table}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    table(e);
                  }
                }}
              >
                {i18next.t("editor-toolbar.table-3-col")}
              </div>
              <div
                className="sub-tool-menu-item"
                role="button"
                tabIndex={0}
                onClick={table2}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    table2(e);
                  }
                }}
              >
                {i18next.t("editor-toolbar.table-2-col")}
              </div>
              <div
                className="sub-tool-menu-item"
                role="button"
                tabIndex={0}
                onClick={table1}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    table1(e);
                  }
                }}
              >
                {i18next.t("editor-toolbar.table-1-col")}
              </div>
            </div>
          </div>
        </Tooltip>
        <div className="tool-separator" />
        {activeUser && isMobile ? (
          <Tooltip content={i18next.t("editor-toolbar.image")}>
            <div
              className="editor-tool"
              role="button"
              tabIndex={0}
              aria-label={i18next.t("editor-toolbar.image")}
              onClick={() => setMobileImage(!mobileImage)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setMobileImage(!mobileImage);
                }
              }}
            >
              {imageSvg}
            </div>
          </Tooltip>
        ) : (
          <Tooltip content={i18next.t("editor-toolbar.image")}>
            <div
              className="editor-tool"
              role="button"
              tabIndex={0}
              aria-label={i18next.t("editor-toolbar.image")}
              onClick={() => setImage(!image)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setImage(!image);
                }
              }}
            >
              {imageSvg}

              {activeUser && (
                <div className="sub-tool-menu">
                  <div
                    className="sub-tool-menu-item"
                    role="button"
                    tabIndex={0}
                    onClick={(e: React.MouseEvent<HTMLElement>) => {
                      e.stopPropagation();
                      const el = fileInputRef.current?.click();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }
                    }}
                  >
                    {i18next.t("editor-toolbar.upload")}
                  </div>
                  <EcencyConfigManager.Conditional
                    condition={({ visionFeatures }) => visionFeatures.gallery.enabled}
                  >
                    <div
                      className="sub-tool-menu-item"
                      role="button"
                      tabIndex={0}
                      onClick={(e: React.MouseEvent<HTMLElement>) => {
                        e.stopPropagation();
                        setGallery(!gallery);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          setGallery(!gallery);
                        }
                      }}
                    >
                      {i18next.t("editor-toolbar.gallery")}
                    </div>
                  </EcencyConfigManager.Conditional>
                </div>
              )}
            </div>
          </Tooltip>
        )}
        {!comment && onVideoUploaded && (
          <EcencyConfigManager.Conditional
            condition={({ thirdPartyFeatures }) => thirdPartyFeatures.threeSpeak.uploading.enabled}
          >
            <Tooltip content={i18next.t("video-upload.upload-video")}>
              <button
                type="button"
                className="editor-tool"
                onClick={() => activeUser && setShowVideoUpload(true)}
                disabled={!activeUser}
              >
                {videoSvg}
                <VideoUpload
                  show={showVideoUpload}
                  setShow={(v) => setShowVideoUpload(v)}
                  onVideoUploaded={(embedUrl, thumbnailUrl) =>
                    onVideoUploaded(embedUrl, thumbnailUrl)
                  }
                />
              </button>
            </Tooltip>
          </EcencyConfigManager.Conditional>
        )}
        <Tooltip content={i18next.t("editor-toolbar.emoji")}>
          <div className="editor-tool" role="none">
            <div
              ref={emojiButtonRef}
              role="button"
              tabIndex={0}
              aria-label={i18next.t("editor-toolbar.emoji")}
              onClick={() => setEmoji(!emoji)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setEmoji(!emoji);
                }
              }}
            >
              {emoticonHappyOutlineSvg}
            </div>
            {emoji && (
              <EmojiPicker
                show={emoji}
                changeState={(state) => setEmoji(state)}
                onSelect={(e) => insertText(e, "")}
                buttonRef={emojiButtonRef}
              />
            )}
          </div>
        </Tooltip>
        <Tooltip content={i18next.t("Gif")}>
          <div className="editor-tool" role="none">
            <div
              className="editor-tool-gif-icon"
              role="button"
              tabIndex={0}
              aria-label={i18next.t("Gif")}
              onClick={() => setGif(!gif)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setGif(!gif);
                }
              }}
            >
              {gifIcon}
            </div>
            {gif && (
              <GifPicker
                shGif={true}
                changeState={(gifState) => setGif(gifState ?? false)}
                fallback={(e) => insertText(e, "")}
              />
            )}
          </div>
        </Tooltip>
        <Tooltip content={i18next.t("editor-toolbar.link")}>
          <div
            className="editor-tool"
            role="button"
            tabIndex={0}
            aria-label={i18next.t("editor-toolbar.link")}
            onClick={() => setLink(!link)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setLink(!link);
              }
            }}
          >
            {linkSvg}
          </div>
        </Tooltip>
        {!comment && (
          <Tooltip content={i18next.t("editor-toolbar.polls")}>
            <div
              className={classNameObject({
                "editor-tool": true,
                "bg-green bg-opacity-25": !!existingPoll
              })}
              role="button"
              tabIndex={0}
              aria-label={i18next.t("editor-toolbar.polls")}
              onClick={() => setShowPollsCreation(!showPollsCreation)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setShowPollsCreation(!showPollsCreation);
                }
              }}
            >
              <UilPanelAdd className="size-5" />
            </div>
          </Tooltip>
        )}
      </div>
      <input
        onChange={fileInputChanged}
        className="file-input"
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={true}
        style={{ display: "none" }}
      />
      <EcencyConfigManager.Conditional
        condition={({ visionFeatures }) => visionFeatures.gallery.enabled}
      >
        {activeUser && (
          <GalleryDialog
            show={gallery}
            setShow={setGallery}
            onPick={(url: string) => {
              const fileName = "";
              insertImage(fileName, url);
              setGallery(false);
            }}
          />
        )}
      </EcencyConfigManager.Conditional>
      <EcencyConfigManager.Conditional
        condition={({ visionFeatures }) => visionFeatures.fragments.enabled}
      >
        {activeUser && (
          <FragmentsDialog
            show={fragments}
            setShow={setFragments}
            onPick={(body: string) => {
              insertText(body);
              setFragments(false);
            }}
          />
        )}
      </EcencyConfigManager.Conditional>
      <EcencyConfigManager.Conditional
        condition={({ visionFeatures }) => visionFeatures.imageServer.enabled}
      >
        {image && (
          <AddImage
            onHide={() => setImage(false)}
            onSubmit={(text: string, link: string) => {
              insertImage(text, link);
              setImage(false);
            }}
          />
        )}
      </EcencyConfigManager.Conditional>
      {link && (
        <AddLink
          onHide={() => setLink(false)}
          onSubmit={(text: string, link: string) => {
            insertLink(text, link);
            setLink(false);
          }}
        />
      )}
      <EcencyConfigManager.Conditional
        condition={({ visionFeatures }) =>
          visionFeatures.gallery.enabled && visionFeatures.imageServer.enabled
        }
      >
        {mobileImage && (
          <AddImageMobile
            onHide={() => setMobileImage(false)}
            onPick={(url) => {
              const fileName = "";
              insertImage(fileName, url);
              setMobileImage(false);
            }}
            onGallery={() => {
              setMobileImage(false);
              setGallery(!gallery);
            }}
            onUpload={() => {
              setMobileImage(false);
              fileInputRef.current?.click();
            }}
          />
        )}
      </EcencyConfigManager.Conditional>
      <EcencyConfigManager.Conditional
        condition={({ features }) => features.polls.creating.enabled}
      >
        <PollsCreation
          readonly={readonlyPoll}
          existingPoll={existingPoll}
          show={showPollsCreation}
          setShow={(v) => setShowPollsCreation(v)}
          onAdd={(snap) => onAddPoll?.(snap)}
          onDeletePoll={() => onDeletePoll?.()}
        />
      </EcencyConfigManager.Conditional>
    </>
  );
}

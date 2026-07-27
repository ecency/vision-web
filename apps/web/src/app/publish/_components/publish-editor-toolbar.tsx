"use client";

import {
  isThreeSpeakBeneficiary,
  THREESPEAK_ACCOUNT,
  THREESPEAK_WEIGHT
} from "@/api/threespeak-embed";
import { EcencyConfigManager } from "@/config";
import { error, LoginRequired } from "@/features/shared";
import dynamic from "next/dynamic";

const PublishGifPickerDialog = dynamic(
  () => import("@/app/publish/_components/publish-gif-picker-dialog").then((m) => ({
    default: m.PublishGifPickerDialog
  })),
  { ssr: false }
);

const EcencyImagesUploadDialog = dynamic(
  () => import("@/features/ecency-images").then((m) => ({
    default: m.EcencyImagesUploadDialog
  })),
  { ssr: false }
);

const GalleryDialog = dynamic(
  () => import("@/features/shared/gallery").then((m) => ({
    default: m.GalleryDialog
  })),
  { ssr: false }
);
import { VideoUpload } from "@/features/shared/video-upload-threespeak";
import { StyledTooltip } from "@/features/ui";
import { EmojiPicker } from "@ui/emoji-picker/lazy-emoji-picker";
import { useEditorState } from "@tiptap/react";
import { YOUTUBE_REGEX } from "@/features/tiptap-editor";
import {
  UilAlignCenter,
  UilAlignJustify,
  UilAlignLeft,
  UilAlignRight,
  UilArrow,
  UilBorderHorizontal,
  UilDocumentLayoutRight,
  UilEllipsisH,
  UilImage,
  UilImages,
  UilImageShare,
  UilLanguage,
  UilLink,
  UilListOl,
  UilListUiAlt,
  UilListUl,
  UilMap,
  UilMapPin,
  UilMapPinAlt,
  UilPalette,
  UilPanelAdd,
  UilParagraph,
  UilSmile,
  UilSubject,
  UilTable,
  UilTextSize,
  UilUpload,
  UilVideo
} from "@tooni/iconscout-unicons-react";
import { Button } from "@ui/button";
import {
  Dropdown,
  DropdownItem,
  DropdownItemWithIcon,
  DropdownMenu,
  DropdownToggle
} from "@ui/dropdown";
import { DropdownContext } from "@ui/dropdown/dropdown-context";
import i18next from "i18next";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePublishState, useUploadAndInsertImages } from "../_hooks";
import { IMAGE_UPLOAD_ACCEPT } from "@/utils/image-upload-formats";
import { PublishEditorTableToolbar } from "./publish-editor-table-toolbar";

import { PublishEditorToolbarFragments } from "./publish-editor-toolbar-fragments";
import { AiImageIcon } from "@/features/shared/ai-image-icon";
import { UilEditAlt } from "@tooni/iconscout-unicons-react";
import { parseAllExtensionsToDoc } from "@/features/tiptap-editor";
import { simpleMarkdownToHTML } from "@ecency/render-helper";

const PublishEditorVideoByLinkDialog = dynamic(
  () => import("./publish-editor-video-by-link-dialog").then((m) => ({
    default: m.PublishEditorVideoByLinkDialog
  })),
  { ssr: false }
);

const PublishImageByLinkDialog = dynamic(
  () => import("./publish-image-by-link-dialog").then((m) => ({
    default: m.PublishImageByLinkDialog
  })),
  { ssr: false }
);

const PublishEditorGeoTagDialog = dynamic(
  () => import("./publish-editor-geo-tag/publish-editor-geo-tag-dialog").then((m) => ({
    default: m.PublishEditorGeoTagDialog
  })),
  { ssr: false }
);

const PublishTranslateDialog = dynamic(
  () => import("./publish-translate-dialog").then((m) => ({
    default: m.PublishTranslateDialog
  })),
  { ssr: false }
);

const AiImageGeneratorDialog = dynamic(
  () => import("@/features/shared/ai-image-generator").then((m) => ({
    default: m.AiImageGeneratorDialog
  })),
  { ssr: false }
);

const AiAssistDialog = dynamic(
  () => import("@/features/shared/ai-assist").then((m) => ({
    default: m.AiAssistDialog
  })),
  { ssr: false }
);

// Code-split the meme maker (iframe + postMessage bridge) so it adds nothing to
// the initial editor bundle - it only loads when the user clicks the button.
const MemeMakerDialog = dynamic(
  () => import("@/features/decentmemes").then((m) => ({
    default: m.MemeMakerDialog
  })),
  { ssr: false }
);
import clsx from "clsx";
import { TEXT_COLORS, normalizeTextColor } from "../_constants/text-colors";

interface Props {
  editor: any | null;
  allowToUploadVideo?: boolean;
}

const headings = [1, 2, 3, 4, 5, 6];
const colorPalette = TEXT_COLORS;

function PublishEditorToolbarColorPalette({ editor }: { editor: any | null }) {
  const { setShow } = useContext(DropdownContext);
  const activeColor = normalizeTextColor(
    editor?.getAttributes("textStyle")?.color as string | undefined
  );

  return (
    <div className="flex flex-col gap-3 px-3 py-2">
      <div className="grid grid-cols-7 gap-2">
        {colorPalette.map((color) => {
          const isActive = editor?.isActive("textStyle", { color });

          return (
            <button
              key={color}
              type="button"
              onClick={() => {
                editor?.chain().focus().setColor(color).run();
                setShow(false);
              }}
              className={clsx(
                "h-6 w-6 rounded-full border border-[--border-color] transition-all",
                isActive && "ring-2 ring-offset-2 ring-blue-dark-sky"
              )}
              style={{ backgroundColor: color }}
            >
              <span className="sr-only">{color}</span>
            </button>
          );
        })}
      </div>
      <Button
        size="sm"
        appearance="gray-link"
        onClick={() => {
          editor?.chain().focus().unsetColor().run();
          setShow(false);
        }}
      >
        {i18next.t("publish.action-bar.clear-color", { defaultValue: "Clear color" })}
      </Button>
      {activeColor && (
        <div className="text-xs text-gray-500">
          {i18next.t("publish.action-bar.selected-color", {
            defaultValue: "Selected color: {{color}}",
            color: activeColor
          })}
        </div>
      )}
    </div>
  );
}

export function PublishEditorToolbar({ editor, allowToUploadVideo = true }: Props) {
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const publishState = usePublishState();
  const { canAlign } = useEditorState({
    editor,
    selector: ({ editor }) => ({
      canAlign:
        editor?.isActive("paragraph") ||
        editor?.isActive("image") ||
        editor?.isActive("heading") ||
        editor?.isActive("youtubeVideo")
    })
  });

  const [showFragments, setShowFragments] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showImageByLink, setShowImageByLink] = useState(false);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [pickedImages, setPickedImages] = useState<File[]>([]);
  const [showVideoUpload, setShowVideoUpload] = useState(false);
  const [showVideoLink, setShowVideoLink] = useState(false);
  const [showGeoTag, setShowGeoTag] = useState(false);
  const [showTranslate, setShowTranslate] = useState(false);
  const [showAiGenerator, setShowAiGenerator] = useState(false);
  const [showAiAssist, setShowAiAssist] = useState(false);
  const [showMemeMaker, setShowMemeMaker] = useState(false);
  const [isFocusingTable, setIsFocusingTable] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const uploadAndInsertImages = useUploadAndInsertImages(editor);

  const onImagesPicked = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = "";

      if (files.length === 0) {
        return;
      }

      // A single image has nothing to review - upload it straight away. Several
      // images open the dialog so they can be previewed before uploading.
      if (files.length === 1) {
        uploadAndInsertImages(files, "toolbar");
        return;
      }

      setPickedImages(files);
      setShowImageUpload(true);
    },
    [uploadAndInsertImages]
  );

  const activeTextColor = editor?.getAttributes("textStyle")?.color as string | undefined;

  useEffect(() => {
    if (!editor) {
      return;
    }

    const handleSelectionUpdate = ({ editor: currentEditor }: any) => {
      setIsFocusingTable(currentEditor.isActive("table"));
    };

    editor.on("selectionUpdate", handleSelectionUpdate);

    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate);
    };
  }, [editor]);

  const clearChain = useCallback(() => editor?.chain().focus().setTextAlign("left"), [editor]);

  return (
    <>
      <div className="w-full items-center p-2 sm:py-0 flex flex-wrap gap-1 sm:gap-0">
        <StyledTooltip content={!canAlign && i18next.t("publish.action-bar.align-hint")}>
          <Button
            appearance={editor?.isActive({ textAlign: "left" }) ? "link" : "gray-link"}
            size="sm"
            disabled={!canAlign}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            icon={<UilAlignLeft />}
            aria-label={i18next.t("publish.action-bar.align-left", { defaultValue: "Align left" })}
            aria-pressed={editor?.isActive({ textAlign: "left" })}
          />
        </StyledTooltip>
        <StyledTooltip content={!canAlign && i18next.t("publish.action-bar.align-hint")}>
          <Button
            appearance={editor?.isActive({ textAlign: "center" }) ? "link" : "gray-link"}
            size="sm"
            disabled={!canAlign}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            icon={<UilAlignCenter />}
            aria-label={i18next.t("publish.action-bar.align-center", { defaultValue: "Align center" })}
            aria-pressed={editor?.isActive({ textAlign: "center" })}
          />
        </StyledTooltip>
        <StyledTooltip content={!canAlign && i18next.t("publish.action-bar.align-hint")}>
          <Button
            appearance={editor?.isActive({ textAlign: "right" }) ? "link" : "gray-link"}
            size="sm"
            disabled={!canAlign}
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            icon={<UilAlignRight />}
            aria-label={i18next.t("publish.action-bar.align-right", { defaultValue: "Align right" })}
            aria-pressed={editor?.isActive({ textAlign: "right" })}
          />
        </StyledTooltip>
        <StyledTooltip content={!canAlign && i18next.t("publish.action-bar.align-hint")}>
          <Button
            appearance={editor?.isActive({ textAlign: "justify" }) ? "link" : "gray-link"}
            size="sm"
            disabled={!canAlign}
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
            icon={<UilAlignJustify />}
            aria-label={i18next.t("publish.action-bar.align-justify", { defaultValue: "Justify" })}
            aria-pressed={editor?.isActive({ textAlign: "justify" })}
          />
        </StyledTooltip>
        <div className="border-r border-[--border-color] h-10 w-[1px] hidden sm:block" />
        <StyledTooltip content={i18next.t("publish.action-bar.paragraph")}>
          <Button
            appearance={editor?.isActive("paragraph") ? "link" : "gray-link"}
            size="sm"
            onClick={() => editor?.chain().focus().setParagraph().run()}
            icon={<UilParagraph />}
            aria-label={i18next.t("publish.action-bar.paragraph")}
            aria-pressed={editor?.isActive("paragraph")}
          />
        </StyledTooltip>

        <StyledTooltip content={i18next.t("publish.action-bar.heading")}>
          <Dropdown>
            <DropdownToggle>
              <Button appearance="gray-link" size="sm" icon={<UilTextSize />} aria-label={i18next.t("publish.action-bar.heading")} aria-haspopup="menu" />
              <DropdownMenu>
                {headings.map((heading) => (
                  <DropdownItem
                    key={heading}
                    selected={editor?.isActive("heading", { level: heading })}
                    onClick={() => clearChain().toggleHeading({ level: heading }).run()}
                  >
                    {i18next.t("publish.heading")} {heading}
                  </DropdownItem>
                ))}
              </DropdownMenu>
            </DropdownToggle>
          </Dropdown>
        </StyledTooltip>

        <StyledTooltip content={i18next.t("publish.action-bar.list")}>
          <Dropdown>
            <DropdownToggle>
              <Button appearance="gray-link" size="sm" icon={<UilListUiAlt />} aria-label={i18next.t("publish.action-bar.list")} aria-haspopup="menu" />
            </DropdownToggle>
            <DropdownMenu>
              <DropdownItemWithIcon
                selected={editor?.isActive("bulletList")}
                icon={<UilListUl />}
                label={i18next.t("publish.bullet-list")}
                onClick={() => clearChain().toggleBulletList().run()}
              />
              <DropdownItemWithIcon
                selected={editor?.isActive("orderedList")}
                icon={<UilListOl />}
                label={i18next.t("publish.ordered-list")}
                onClick={() => clearChain().toggleOrderedList().run()}
              />
            </DropdownMenu>
          </Dropdown>
        </StyledTooltip>

        <Dropdown>
          <DropdownToggle>
            <Button icon={<UilEllipsisH />} size="sm" appearance="gray-link" aria-label={i18next.t("g.menu", { defaultValue: "Menu" })} aria-haspopup="menu" />
          </DropdownToggle>
          <DropdownMenu>
            <DropdownItemWithIcon
              onClick={() => clearChain().toggleCodeBlock().run()}
              selected={editor?.isActive("codeBlock")}
              icon={<UilArrow />}
              label={i18next.t("publish.code-block")}
            />
            <DropdownItemWithIcon
              onClick={() => clearChain().toggleBlockquote().run()}
              selected={editor?.isActive("blockquote")}
              icon={<UilDocumentLayoutRight />}
              label={i18next.t("publish.quote")}
            />
            <DropdownItemWithIcon
              onClick={() =>
                clearChain().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()
              }
              icon={<UilTable />}
              label={i18next.t("publish.table")}
            />
            <DropdownItemWithIcon
              icon={<UilBorderHorizontal />}
              label={i18next.t("publish.horizontal-rule")}
              onClick={() => clearChain().setHorizontalRule().run()}
            />
          </DropdownMenu>
        </Dropdown>
        <div className="border-r border-[--border-color] h-10 w-[1px] hidden sm:block" />
        <EcencyConfigManager.Conditional
          condition={({ visionFeatures }) => visionFeatures.fragments.enabled}
        >
          <StyledTooltip content={i18next.t("publish.action-bar.fragments")}>
            <LoginRequired>
              <Button
                appearance="gray-link"
                size="sm"
                onClick={() => setShowFragments(true)}
                icon={<UilSubject />}
                aria-label={i18next.t("publish.action-bar.fragments")}
              />
            </LoginRequired>
          </StyledTooltip>
        </EcencyConfigManager.Conditional>

        <EcencyConfigManager.Conditional
          condition={({ visionFeatures }) => visionFeatures.publish.composeTranslate.enabled}
        >
          <StyledTooltip content={i18next.t("publish.translate.title")}>
            <Button
              appearance="gray-link"
              size="sm"
              onClick={() => setShowTranslate(true)}
              icon={<UilLanguage />}
              aria-label={i18next.t("publish.translate.title")}
            />
          </StyledTooltip>
        </EcencyConfigManager.Conditional>

        <EcencyConfigManager.Conditional
          condition={({ visionFeatures }) => visionFeatures.gallery.enabled}
        >
          <StyledTooltip content={i18next.t("publish.action-bar.image")}>
            <LoginRequired>
              <Dropdown>
                <DropdownToggle>
                  <Button appearance="gray-link" size="sm" icon={<UilImage />} aria-label={i18next.t("publish.action-bar.image")} aria-haspopup="menu" />
                </DropdownToggle>
                <DropdownMenu>
                  <DropdownItemWithIcon
                    icon={<UilUpload />}
                    label={i18next.t("publish.upload")}
                    onClick={() => imageInputRef.current?.click()}
                  />
                  <DropdownItemWithIcon
                    icon={<UilImages />}
                    label={i18next.t("publish.from-gallery")}
                    onClick={() => setShowGallery(true)}
                  />
                  <DropdownItemWithIcon
                    icon={<UilImageShare />}
                    label={i18next.t("publish.from-link")}
                    onClick={() => setShowImageByLink(true)}
                  />
                </DropdownMenu>
              </Dropdown>
            </LoginRequired>
          </StyledTooltip>
        </EcencyConfigManager.Conditional>

        <StyledTooltip content={i18next.t("publish.action-bar.gif")}>
          <Button
            appearance="gray-link"
            size="sm"
            onClick={() => setShowGifPicker(true)}
          >
            {i18next.t("publish.action-bar.gif")}
          </Button>
        </StyledTooltip>

        <StyledTooltip content={i18next.t("publish.action-bar.video")}>
          <LoginRequired>
            <Dropdown>
              <DropdownToggle>
                <Button icon={<UilVideo />} appearance="gray-link" size="sm" aria-label={i18next.t("publish.action-bar.video")} aria-haspopup="menu" />
              </DropdownToggle>
              <DropdownMenu>
                {allowToUploadVideo && !publishState.hasThreeSpeakVideo && (
                  <DropdownItemWithIcon
                    icon={<UilUpload />}
                    label={i18next.t("publish.three-speak-upload")}
                    onClick={() => setShowVideoUpload(true)}
                  />
                )}
                <DropdownItemWithIcon
                  icon={<UilLink />}
                  label={i18next.t("publish.from-link")}
                  onClick={() => setShowVideoLink(true)}
                />
              </DropdownMenu>
            </Dropdown>
          </LoginRequired>
        </StyledTooltip>

        <StyledTooltip content={i18next.t("publish.action-bar.poll")}>
          <Button
            appearance="gray-link"
            size="sm"
            onClick={() => {
              publishState.createDefaultPoll();
              setTimeout(
                () =>
                  document
                    .getElementById("publish-active-poll")
                    ?.scrollIntoView({ behavior: "smooth" }),
                100
              );
            }}
            icon={<UilPanelAdd />}
            aria-label={i18next.t("publish.action-bar.poll")}
          />
        </StyledTooltip>
        <EcencyConfigManager.Conditional
          condition={({ visionFeatures }) => visionFeatures.publish.geoPicker.enabled}
        >
          <StyledTooltip content={i18next.t("publish.action-bar.geotag")}>
            <Button
              appearance="gray-link"
              size="sm"
              onClick={() => setShowGeoTag(true)}
              icon={<UilMap className={clsx(publishState.location && "text-green-hover")} />}
              aria-label={i18next.t("publish.action-bar.geotag")}
            />
          </StyledTooltip>
        </EcencyConfigManager.Conditional>

        <div className="border-r border-[--border-color] h-10 w-[1px] hidden sm:block" />
        <div className="relative">
          <StyledTooltip content={i18next.t("publish.action-bar.emoji")}>
            <Button
              ref={emojiButtonRef}
              appearance="gray-link"
              size="sm"
              icon={<UilSmile />}
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              aria-label={i18next.t("publish.action-bar.emoji")}
              aria-haspopup="dialog"
              aria-expanded={showEmojiPicker}
            />
          </StyledTooltip>
          {showEmojiPicker && (
            <EmojiPicker
              show={showEmojiPicker}
              changeState={(state) => setShowEmojiPicker(state)}
              onSelect={(e) => editor?.chain().focus().insertContent(e).run()}
              buttonRef={emojiButtonRef}
            />
          )}
        </div>

        <StyledTooltip
            content={i18next.t("publish.action-bar.color", { defaultValue: "Text color" })}
        >
          <Dropdown>
            <DropdownToggle>
              <Button
                  appearance={activeTextColor ? "link" : "gray-link"}
                  size="sm"
                  icon={
                    <span className="relative flex items-center justify-center [&>svg]:size-5">
                    <UilPalette />
                    <span
                        className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border border-white shadow"
                        style={{ backgroundColor: activeTextColor ?? "transparent" }}
                    />
                  </span>
                  }
                  aria-label={i18next.t("publish.action-bar.color", { defaultValue: "Text color" })}
                  aria-haspopup="menu"
              />
            </DropdownToggle>
            <DropdownMenu size="small" className="!min-w-[200px] gap-3">
              <PublishEditorToolbarColorPalette editor={editor} />
            </DropdownMenu>
          </Dropdown>
        </StyledTooltip>

        <EcencyConfigManager.Conditional
          condition={({ visionFeatures }) => visionFeatures.aiImageGenerator.enabled || visionFeatures.aiAssist?.enabled}
        >
          <div className="border-r border-[--border-color] h-10 w-[1px] hidden sm:block" />
        </EcencyConfigManager.Conditional>
        <EcencyConfigManager.Conditional
          condition={({ visionFeatures }) => visionFeatures.aiImageGenerator.enabled}
        >
          <StyledTooltip content={i18next.t("ai-image-generator.toolbar-button")}>
            <LoginRequired>
              <Button
                appearance="gray-link"
                size="sm"
                icon={<AiImageIcon />}
                onClick={() => setShowAiGenerator(true)}
                aria-label={i18next.t("ai-image-generator.toolbar-button")}
              />
            </LoginRequired>
          </StyledTooltip>
        </EcencyConfigManager.Conditional>

        <EcencyConfigManager.Conditional
          condition={({ visionFeatures }) => visionFeatures.aiAssist?.enabled}
        >
          <StyledTooltip content={i18next.t("ai-assist.toolbar-button")}>
            <LoginRequired>
              <Button
                appearance="gray-link"
                size="sm"
                icon={
                  <span className="relative inline-flex [&>svg]:size-5">
                    <UilEditAlt />
                    <span className="absolute -top-1.5 -right-2.5 text-[8px] font-bold leading-none bg-blue-dark-sky text-white rounded px-0.5 py-px">
                      AI
                    </span>
                  </span>
                }
                onClick={() => setShowAiAssist(true)}
                aria-label={i18next.t("ai-assist.toolbar-button")}
              />
            </LoginRequired>
          </StyledTooltip>
        </EcencyConfigManager.Conditional>

        <EcencyConfigManager.Conditional
          condition={({ visionFeatures }) => visionFeatures.decentMemes.enabled}
        >
          <StyledTooltip content={i18next.t("decentmemes.toolbar-button")}>
            <LoginRequired>
              <Button
                appearance="gray-link"
                size="sm"
                icon={<UilImageShare />}
                onClick={() => setShowMemeMaker(true)}
                aria-label={i18next.t("decentmemes.toolbar-button")}
              />
            </LoginRequired>
          </StyledTooltip>
        </EcencyConfigManager.Conditional>

        {/*Dialogs*/}
        <PublishEditorToolbarFragments
          showFragments={showFragments}
          setShowFragments={setShowFragments}
          editor={editor}
        />
        <EcencyConfigManager.Conditional
          condition={({ visionFeatures }) => visionFeatures.gallery.enabled}
        >
          <GalleryDialog
            show={showGallery}
            setShow={setShowGallery}
            onPick={(e) => {
              editor
                ?.chain()
                .focus()
                .insertContent([
                  { type: "image", attrs: { src: e } },
                  { type: "paragraph" },
                  { type: "paragraph" }
                ])
                .run();
              setShowGallery(false);
            }}
          />
        </EcencyConfigManager.Conditional>
        <PublishGifPickerDialog
          show={showGifPicker}
          setShow={setShowGifPicker}
          onPick={(url, alt) => {
            editor
              ?.chain()
              .focus()
              .insertContent([
                { type: "image", attrs: { src: url, alt } },
                { type: "paragraph" },
                { type: "paragraph" }
              ])
              .run();
            setShowGifPicker(false);
          }}
        />
        <PublishImageByLinkDialog
          show={showImageByLink}
          setShow={setShowImageByLink}
          onPick={(link, alt) => {
            editor
              ?.chain()
              .focus()
              .insertContent([
                { type: "image", attrs: { src: link, alt } },
                { type: "paragraph" },
                { type: "paragraph" }
              ])
              .run();
            setShowImageByLink(false);
          }}
        />
        <input
          ref={imageInputRef}
          type="file"
          multiple={true}
          accept={IMAGE_UPLOAD_ACCEPT}
          className="hidden"
          onChange={onImagesPicked}
        />
        <EcencyImagesUploadDialog
          show={showImageUpload}
          setShow={(show) => {
            setShowImageUpload(show);
            if (!show) {
              setPickedImages([]);
            }
          }}
          initialFiles={pickedImages}
          onPick={(e) => {
            editor
              ?.chain()
              .focus()
              .insertContent([
                { type: "image", attrs: { src: e } },
                { type: "paragraph" },
                { type: "paragraph" }
              ])
              .run();
          }}
        />

        <VideoUpload
          show={showVideoUpload}
          setShow={setShowVideoUpload}
          onVideoUploaded={(embedUrl, videoThumbnailUrl) => {
            if (editor) {
              editor
                .chain()
                .focus()
                .set3SpeakVideo({
                  src: embedUrl,
                  thumbnail: videoThumbnailUrl || "",
                  status: "published"
                })
                .run();
            }

            // Add video thumbnail to post metadata so feed cards show it
            if (videoThumbnailUrl) {
              publishState.setEntryImages((prev) =>
                prev.includes(videoThumbnailUrl) ? prev : [...prev, videoThumbnailUrl]
              );
            }

            // Add required 3Speak beneficiary (hasThreeSpeakVideo derives from content automatically)
            publishState.setBeneficiaries((prev) => {
              if (prev.some((b) => isThreeSpeakBeneficiary(b.account))) {
                return prev;
              }
              return [...prev, { account: THREESPEAK_ACCOUNT, weight: THREESPEAK_WEIGHT }];
            });

            setShowVideoUpload(false);
          }}
        />

        <PublishEditorVideoByLinkDialog
          show={showVideoLink}
          setShow={setShowVideoLink}
          onAdd={(e) => {
            const match = e.match(YOUTUBE_REGEX);
            if (match) {
              clearChain()
                .setYoutubeVideo({
                  src: e,
                  thumbnail: `https://img.youtube.com/vi/${match[1]}/0.jpg`
                })
                .run();
            } else {
              clearChain().insertContent(`![](${e})`).run();
            }
            setShowVideoLink(false);
          }}
        />
        {showAiGenerator && (
          <AiImageGeneratorDialog
            show={showAiGenerator}
            setShow={setShowAiGenerator}
            suggestedPrompt={publishState.title?.trim() || undefined}
            onInsert={(url) => {
              editor
                ?.chain()
                .focus()
                .insertContent([
                  { type: "image", attrs: { src: url } },
                  { type: "paragraph" },
                  { type: "paragraph" },
                ])
                .run();
              // We generated this image, so pre-mark the AI-usage disclosure (editable in
              // the AI usage dialog before publishing).
              publishState.setAiTools((prev) => ({ ...prev, media_generation: true }));
              setShowAiGenerator(false);
            }}
          />
        )}
        {showAiAssist && (
          <AiAssistDialog
            show={showAiAssist}
            setShow={setShowAiAssist}
            initialText={editor?.getText()?.trim() || ""}
            onApply={(output, action) => {
              if (action === "improve" || action === "check_grammar" || action === "summarize") {
                // Only body-editing actions set writing_edit. Title generation and tag
                // suggestions aren't grammar/formatting edits, so they leave it unset
                // (still editable in the AI usage dialog).
                publishState.setAiTools((prev) => ({ ...prev, writing_edit: true }));
                const sanitized = simpleMarkdownToHTML(output);
                const doc = parseAllExtensionsToDoc(sanitized);
                editor?.commands.setContent(doc);
                setShowAiAssist(false);
              } else if (action === "generate_title") {
                publishState.setTitle(output.trim());
                setShowAiAssist(false);
              } else if (action === "suggest_tags") {
                try {
                  const tags = JSON.parse(output);
                  if (Array.isArray(tags)) {
                    const valid = tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((t) => t.trim());
                    if (valid.length > 0) {
                      const tagNodes: any[] = [];
                      valid.forEach((t, i) => {
                        if (i > 0) tagNodes.push({ type: "text", text: " " });
                        tagNodes.push({ type: "tag", attrs: { id: t, label: t } });
                      });
                      editor?.chain().focus("end").insertContent([
                        { type: "paragraph" },
                        { type: "paragraph", content: tagNodes }
                      ]).run();
                      setShowAiAssist(false);
                      return;
                    }
                  }
                } catch {
                  // parse failed
                }
                error(i18next.t("ai-assist.error-generic"));
              }
            }}
          />
        )}
        {showMemeMaker && (
          <MemeMakerDialog
            show={showMemeMaker}
            setShow={setShowMemeMaker}
            onMemeCreated={({ url, alt, templateId, beneficiaries }) => {
              editor
                ?.chain()
                .focus()
                .insertContent([
                  { type: "image", attrs: { src: url, alt } },
                  { type: "paragraph" },
                  { type: "paragraph" }
                ])
                .run();
              publishState.addDecentMemesResult({ templateId, imageUrl: url, beneficiaries });
              setShowMemeMaker(false);
            }}
          />
        )}
        {showTranslate && (
          <PublishTranslateDialog
            show={showTranslate}
            setShow={setShowTranslate}
            editor={editor}
          />
        )}
        {showGeoTag && (
          <PublishEditorGeoTagDialog
            show={showGeoTag}
            setShow={setShowGeoTag}
            initialLocation={publishState.location}
            onPick={(location) => {
              publishState.setLocation(location);
              setShowGeoTag(false);
            }}
            onClear={() => {
              publishState.clearLocation();
              setShowGeoTag(false);
            }}
          />
        )}
      </div>
      {isFocusingTable && <PublishEditorTableToolbar editor={editor} />}
    </>
  );
}

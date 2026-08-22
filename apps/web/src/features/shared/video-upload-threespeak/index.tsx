import { useThreeSpeakEmbedUpload } from "@/api/threespeak-embed";
import { setVideoThumbnail } from "@/api/threespeak-embed/api";
import { useUploadImageMutation } from "@/api/sdk-mutations";
import { useGlobalStore } from "@/core/global-store";
import { error } from "@/features/shared";
import { Button } from "@ui/button";
import { Modal, ModalBody, ModalHeader, ModalTitle } from "@ui/modal";
import { recordVideoSvg } from "@ui/svg";
import i18next from "i18next";
import React, { ChangeEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import useMountedState from "react-use/lib/useMountedState";
import { VideoUploadItem } from "./video-upload-item";
import { VideoUploadRecorder } from "./video-upload-recorder";
import { useActiveAccount } from "@/core/hooks/use-active-account";

interface Props {
  children?: ReactNode;
  show: boolean;
  setShow: (v: boolean) => void;
  onVideoUploaded: (embedUrl: string, thumbnailUrl?: string) => void;
  /**
   * Controls the video type sent to 3Speak.
   * - `true`  - always upload as a Short (used by Waves)
   * - `false` - always upload as a regular Video
   * - `undefined` (default) - show a Short/Video toggle so the user can choose
   */
  isShort?: boolean;
}

interface VideoData {
  embedUrl: string;
  permlink: string;
}

export const VideoUpload = (props: Props & React.HTMLAttributes<HTMLDivElement>) => {
  const { activeUser } = useActiveAccount();
  const toggleUIProp = useGlobalStore((s) => s.toggleUiProp);
  const { mutateAsync: uploadVideo, completed: videoPercentage, setCompleted: setVideoPercentage } =
    useThreeSpeakEmbedUpload();

  const { mutateAsync: uploadThumbnailImage, isPending: isThumbnailUploading } =
    useUploadImageMutation();

  const videoRef = useRef<HTMLVideoElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const selectedFileUrlRef = useRef<string | undefined>(undefined);
  const dialogOpenRef = useRef(false);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileType, setSelectedFileType] = useState<string>("video/mp4");
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const [showRecorder, setShowRecorder] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [isExtractingThumbnail, setIsExtractingThumbnail] = useState(false);
  const [hasManualThumbnail, setHasManualThumbnail] = useState(false);
  // When isShort prop is undefined, let the user toggle; default to false (regular video)
  const [shortToggle, setShortToggle] = useState(false);

  const isShortResolved = props.isShort ?? shortToggle;
  const showTypeSelector = props.isShort === undefined;
  const isUploading = videoPercentage > 0 && videoPercentage < 100;

  const isMounted = useMountedState();

  // Reset on dialog hide
  useEffect(() => {
    dialogOpenRef.current = props.show;
    if (!props.show) {
      if (selectedFileUrlRef.current) {
        URL.revokeObjectURL(selectedFileUrlRef.current);
        selectedFileUrlRef.current = undefined;
      }
      setSelectedFile(null);
      setSelectedFileType("video/mp4");
      setVideoData(null);
      setThumbnailUrl("");
      setHasManualThumbnail(false);
      setIsExtractingThumbnail(false);
      setVideoPercentage(0);
      setShowRecorder(false);
      setShortToggle(false);
    }
  }, [props.show, setVideoPercentage]);

  const maxFileSizeBytes = 1 * 1024 * 1024 * 1024; // 1 GB

  const handleVideoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeUser) return;

    if (file.size > maxFileSizeBytes) {
      error(i18next.t("video-upload.file-too-large"));
      e.target.value = "";
      return;
    }

    // Show local preview
    if (selectedFileUrlRef.current) {
      URL.revokeObjectURL(selectedFileUrlRef.current);
    }
    const fileUrl = URL.createObjectURL(file);
    selectedFileUrlRef.current = fileUrl;
    setSelectedFile(fileUrl);
    setSelectedFileType(file.type || "video/mp4");

    try {
      const result = await uploadVideo({
        file,
        owner: activeUser.username,
        isShort: isShortResolved
      });
      if (result && dialogOpenRef.current) {
        setVideoData({ embedUrl: result.embedUrl, permlink: result.permlink });
      }
    } catch {
      // Error already shown by the mutation's error handler.
      // Reset file state so the selector reappears and user can retry.
      if (dialogOpenRef.current) {
        setSelectedFile(null);
      }
    }
  };

  const handleRecordedUpload = (embedUrl: string, videoPermlink: string) => {
    setVideoData({ embedUrl, permlink: videoPermlink });
  };

  const extractFrameAsBlob = useCallback(
    (video: HTMLVideoElement): Promise<Blob | null> =>
      new Promise((resolve) => {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) {
          resolve(null);
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          canvas.width = 0;
          canvas.height = 0;
          resolve(null);
          return;
        }
        ctx.drawImage(video, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            // Release canvas GPU resources
            canvas.width = 0;
            canvas.height = 0;
            resolve(blob);
          },
          "image/jpeg",
          0.85
        );
      }),
    []
  );

  // Auto-extract thumbnail from video once upload completes
  useEffect(() => {
    if (!videoData?.permlink || !selectedFile || hasManualThumbnail || thumbnailUrl) {
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const abortController = new AbortController();
    const permlink = videoData.permlink;

    const timeout = setTimeout(() => abortController.abort(), 15_000);

    const handleSeeked = async () => {
      if (abortController.signal.aborted) return;
      setIsExtractingThumbnail(true);
      try {
        const blob = await extractFrameAsBlob(video);
        if (abortController.signal.aborted || !blob) return;

        const file = new File([blob], "auto-thumbnail.jpg", { type: "image/jpeg" });
        const response = await uploadThumbnailImage({ file, signal: abortController.signal });
        if (abortController.signal.aborted || !response?.url) return;

        setThumbnailUrl(response.url);
        try {
          await setVideoThumbnail(permlink, response.url);
        } catch {
          // Thumbnail image uploaded successfully but metadata persistence failed - non-critical
        }
      } catch {
        // Extraction or upload failed/aborted - non-critical, user can still insert video
      } finally {
        if (!abortController.signal.aborted) setIsExtractingThumbnail(false);
      }
    };

    const handleLoaded = () => {
      if (abortController.signal.aborted) return;
      // Seek 25% in, past intros and black opening frames. The previous clamp capped this
      // at 1s, so anything longer than 4s always grabbed a frame from the very start.
      const { duration } = video;
      video.currentTime =
        Number.isFinite(duration) && duration > 0 ? Math.max(0.1, duration * 0.25) : 1;
    };

    video.addEventListener("seeked", handleSeeked, { once: true });

    if (video.readyState >= 2) {
      handleLoaded();
    } else {
      video.addEventListener("loadeddata", handleLoaded, { once: true });
    }

    return () => {
      clearTimeout(timeout);
      abortController.abort();
      setIsExtractingThumbnail(false);
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("loadeddata", handleLoaded);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- uploadThumbnailImage is a stable mutation fn
  }, [videoData?.permlink, selectedFile, hasManualThumbnail, thumbnailUrl, extractFrameAsBlob]);

  const handleThumbnailChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !videoData?.permlink) return;

    // Set flag immediately to abort any running auto-extractor
    setHasManualThumbnail(true);

    try {
      const response = await uploadThumbnailImage({ file });
      if (response?.url) {
        setThumbnailUrl(response.url);
        try {
          await setVideoThumbnail(videoData.permlink, response.url);
        } catch {
          // Thumbnail image uploaded successfully but metadata persistence failed - non-critical
        }
      }
    } catch {
      setHasManualThumbnail(false);
      error(i18next.t("video-upload.thumbnail-upload-failed"));
    }
  };

  const typeSelector = showTypeSelector && !selectedFile && (
    <div className="mb-3">
      <p className="font-weight-bold mb-2 text-sm opacity-50">
        {i18next.t("video-upload.video-type")}
      </p>
      <div className="flex gap-2" role="group" aria-label={i18next.t("video-upload.video-type")}>
        <button
          type="button"
          aria-pressed={!shortToggle}
          className={`flex-1 rounded-xl border px-3 py-2 text-sm duration-200 ${
            !shortToggle
              ? "border-blue-dark-sky bg-blue-dark-sky text-white"
              : "border-[--border-color] hover:bg-gray-100 dark:hover:bg-dark-default"
          }`}
          onClick={() => setShortToggle(false)}
        >
          {i18next.t("video-upload.type-video")}
        </button>
        <button
          type="button"
          aria-pressed={shortToggle}
          className={`flex-1 rounded-xl border px-3 py-2 text-sm duration-200 ${
            shortToggle
              ? "border-blue-dark-sky bg-blue-dark-sky text-white"
              : "border-[--border-color] hover:bg-gray-100 dark:hover:bg-dark-default"
          }`}
          onClick={() => setShortToggle(true)}
        >
          {i18next.t("video-upload.type-short")}
        </button>
      </div>
    </div>
  );

  const sourceSection = !videoData && (
    <div className="three-speak-video-uploading position-relative">
      <p className="font-weight-bold mb-2 text-sm opacity-50">
        {i18next.t("video-upload.source")}
      </p>
      {showRecorder ? (
        <VideoUploadRecorder
          isShort={isShortResolved}
          onEmbedUrlReady={handleRecordedUpload}
          setSelectedFile={(url, mime) => {
            setSelectedFile(url);
            setSelectedFileType(mime);
          }}
          onReset={() => {
            setShowRecorder(false);
            setSelectedFile(null);
            setVideoData(null);
          }}
        />
      ) : (
        <div className="video-source">
          {isMounted() && !selectedFile && "MediaRecorder" in window ? (
            <button
              type="button"
              className="flex items-center flex-col border border-[--border-color] rounded-xl p-3 hover:bg-gray-100 dark:hover:bg-dark-default cursor-pointer duration-300"
              onClick={() => setShowRecorder(true)}
            >
              {recordVideoSvg}
              {i18next.t("video-upload.record-video")}
            </button>
          ) : (
            <></>
          )}
          <VideoUploadItem
            label={i18next.t("video-upload.choose-video")}
            onFileChange={handleVideoChange}
            type="video"
            accept="video/mp4, video/webm"
            completed={videoPercentage}
            hasFile={!!selectedFile}
          />
        </div>
      )}
    </div>
  );

  const previewSection = videoData && selectedFile && (
    <>
      <div className="file-input">
        <video ref={videoRef} controls={true} className="rounded-xl w-full">
          <source src={selectedFile} type={selectedFileType} />
        </video>
      </div>
      <div className="mt-3">
        <p className="font-weight-bold mb-2 text-sm opacity-50">
          {i18next.t("video-upload.thumbnail")}
        </p>
        <div className="flex items-center gap-3">
          {isExtractingThumbnail ? (
            <div
              className="rounded bg-gray-200 dark:bg-dark-default flex items-center justify-center text-xs text-gray-500"
              style={{ width: 160, height: 90 }}
            >
              {i18next.t("video-upload.extracting-thumbnail")}
            </div>
          ) : thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={i18next.t("video-upload.thumbnail")}
              className="rounded"
              style={{ maxWidth: 160, maxHeight: 90 }}
            />
          ) : null}
          <input
            ref={thumbnailInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleThumbnailChange}
            disabled={isThumbnailUploading || isExtractingThumbnail}
          />
          <Button
            size="sm"
            appearance="gray"
            isLoading={isThumbnailUploading}
            disabled={isThumbnailUploading || isExtractingThumbnail}
            onClick={() => thumbnailInputRef.current?.click()}
          >
            {i18next.t("video-upload.choose-thumbnail")}
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <div
      className={"cursor-pointer " + props.className}
      role="button"
      tabIndex={0}
      onClick={() => (activeUser ? null : toggleUIProp("login"))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!activeUser) toggleUIProp("login");
        }
      }}
    >
      <div className="flex justify-center">{props.children}</div>
      <div>
        <Modal
          show={props.show}
          centered={true}
          onHide={() => props.setShow(false)}
          className="add-image-modal"
        >
          <ModalHeader closeButton={true}>
            <ModalTitle>
              <p>{i18next.t("video-upload.upload-video")}</p>
            </ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div className="dialog-content">
              {typeSelector}
              {sourceSection}
              {previewSection}
              <Button
                className="mt-3"
                disabled={!videoData || isUploading}
                onClick={() => {
                  props.onVideoUploaded(videoData!.embedUrl, thumbnailUrl || undefined);
                  props.setShow(false);
                }}
              >
                {i18next.t("video-upload.insert-video")}
              </Button>
            </div>
          </ModalBody>
        </Modal>
      </div>
    </div>
  );
};

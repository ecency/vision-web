import { useThreeSpeakEmbedUpload } from "@/api/threespeak-embed";
import { getUploadQuota, setVideoThumbnail } from "@/api/threespeak-embed/api";
import {
  isThreeSpeakUploadLimitError,
  quotaToThreeSpeakUploadLimit,
  ThreeSpeakUploadLimit
} from "@/api/threespeak-embed/upload-limits";
import { QueryIdentifiers } from "@/core/react-query";
import { useQuery } from "@tanstack/react-query";
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
import { VideoUploadLimitNotice } from "./video-upload-limit-notice";
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
  const activeUsernameRef = useRef(activeUser?.username);
  activeUsernameRef.current = activeUser?.username;
  const previousUsernameRef = useRef(activeUser?.username);
  // Bumped when the dialog or account changes, so an older upload cannot
  // touch the new session.
  const dialogSessionRef = useRef(0);
  // The picked file's upload in flight. Aborted when nobody will insert it.
  const uploadAbortRef = useRef<AbortController | undefined>(undefined);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileType, setSelectedFileType] = useState<string>("video/mp4");
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const videoDataRef = useRef(videoData);
  videoDataRef.current = videoData;
  const [showRecorder, setShowRecorder] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [isExtractingThumbnail, setIsExtractingThumbnail] = useState(false);
  const [hasManualThumbnail, setHasManualThumbnail] = useState(false);
  // When isShort prop is undefined, let the user toggle; default to false (regular video)
  const [shortToggle, setShortToggle] = useState(false);
  // 3Speak refused an upload over the free daily limit. Kept with the account
  // that uploaded, so a switched account never sees someone else's refusal.
  const [limitRefusal, setLimitRefusal] = useState<{
    owner: string;
    limit: ThreeSpeakUploadLimit;
  } | null>(null);

  const isShortResolved = props.isShort ?? shortToggle;
  const uploadKind = isShortResolved ? "short" : "video";

  // The allowance, read when the dialog opens so a free account at its limit
  // sees the notice before picking a file. Any failure resolves null (no limit
  // known) and never blocks: the token request stays the source of truth.
  const { data: uploadQuota } = useQuery({
    queryKey: [QueryIdentifiers.THREE_SPEAK_UPLOAD_QUOTA, activeUser?.username],
    queryFn: () => getUploadQuota(activeUser!.username),
    enabled: props.show && !!activeUser?.username,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false
  });

  const refusalForThisAccount =
    limitRefusal &&
    limitRefusal.owner === activeUser?.username &&
    (limitRefusal.limit.kind === null || limitRefusal.limit.kind === uploadKind)
      ? limitRefusal.limit
      : null;
  const limitNotice =
    refusalForThisAccount ?? quotaToThreeSpeakUploadLimit(uploadQuota, uploadKind);
  const showTypeSelector = props.isShort === undefined;
  const isUploading = videoPercentage > 0 && videoPercentage < 100;

  const isMounted = useMountedState();

  // Revoke the preview and stop the upload if the dialog goes away mid-way.
  useEffect(
    () => () => {
      if (selectedFileUrlRef.current) URL.revokeObjectURL(selectedFileUrlRef.current);
      uploadAbortRef.current?.abort();
    },
    []
  );

  // A new session whenever the dialog or its active account changes.
  useEffect(() => {
    dialogSessionRef.current += 1;
  }, [props.show, activeUser?.username]);

  // Reset on dialog hide or account switch.
  useEffect(() => {
    dialogOpenRef.current = props.show;
    const accountChanged = previousUsernameRef.current !== activeUser?.username;
    previousUsernameRef.current = activeUser?.username;
    if (!props.show || accountChanged) {
      // Stop an upload nobody will insert: it would keep sending bytes and
      // count against the uploading account's daily limit.
      uploadAbortRef.current?.abort();
      uploadAbortRef.current = undefined;
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
      setLimitRefusal(null);
    }
  }, [props.show, activeUser?.username, setVideoPercentage]);

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

    const abortController = new AbortController();
    uploadAbortRef.current = abortController;

    const owner = activeUser.username;
    const session = dialogSessionRef.current;
    // Only the upload of the file on screen, in this opening of the dialog, may
    // change the dialog: not one from before a close, nor an older pick.
    const isCurrent = () =>
      dialogOpenRef.current &&
      dialogSessionRef.current === session &&
      activeUsernameRef.current === owner &&
      selectedFileUrlRef.current === fileUrl;

    try {
      const result = await uploadVideo({
        file,
        owner,
        isShort: isShortResolved,
        isCurrent,
        signal: abortController.signal
      });
      if (result && isCurrent()) {
        setVideoData({ embedUrl: result.embedUrl, permlink: result.permlink });
      }
    } catch (err) {
      // Error already shown by the mutation's error handler, or, for the daily
      // limit, by the notice. Reset file state so the selector reappears.
      if (isCurrent()) {
        if (isThreeSpeakUploadLimitError(err)) {
          setLimitRefusal({ owner, limit: err.limit });
        }
        setSelectedFile(null);
      }
    }
  };

  const handleRecordedUpload = (embedUrl: string, videoPermlink: string, owner: string) => {
    if (!dialogOpenRef.current || activeUsernameRef.current !== owner) return false;
    setVideoData({ embedUrl, permlink: videoPermlink });
    return true;
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
    const permlink = videoData.permlink;
    const owner = activeUser?.username;
    const session = dialogSessionRef.current;
    const isCurrent = () =>
      dialogOpenRef.current &&
      dialogSessionRef.current === session &&
      activeUsernameRef.current === owner &&
      videoDataRef.current?.permlink === permlink;

    // Set flag immediately to abort any running auto-extractor
    setHasManualThumbnail(true);

    try {
      const response = await uploadThumbnailImage({ file });
      if (response?.url && isCurrent()) {
        setThumbnailUrl(response.url);
        try {
          await setVideoThumbnail(permlink, response.url);
        } catch {
          // Thumbnail image uploaded successfully but metadata persistence failed - non-critical
        }
      }
    } catch {
      if (isCurrent()) {
        setHasManualThumbnail(false);
        error(i18next.t("video-upload.thumbnail-upload-failed"));
      }
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
          isCurrentSession={(owner) => dialogOpenRef.current && activeUsernameRef.current === owner}
          onLimitReached={(limit, owner) => setLimitRefusal({ owner, limit })}
          setSelectedFile={(url, mime) => {
            // Take ownership of the recording's preview URL so the reset revokes it.
            if (selectedFileUrlRef.current && selectedFileUrlRef.current !== url) {
              URL.revokeObjectURL(selectedFileUrlRef.current);
            }
            selectedFileUrlRef.current = url;
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
              {limitNotice && !videoData && (
                <VideoUploadLimitNotice limit={limitNotice} username={activeUser?.username} />
              )}
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

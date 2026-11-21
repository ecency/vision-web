import React, { useCallback, useEffect, useRef, useState } from "react";
import useMountedState from "react-use/lib/useMountedState";
import { VideoUploadRecorderActions } from "./video-upload-recorder-actions";
import { VideoUploadRecorderNoPermission } from "./video-upload-recorder-no-permission";
import { error } from "../feedback";
import { v4 } from "uuid";
import { useUnmount } from "react-use";
import { Button } from "@ui/button";
import { useThreeSpeakEmbedUpload } from "@/api/threespeak-embed";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import i18next from "i18next";
import { formatError } from "@/api/format-error";
import {
  isThreeSpeakUploadLimitError,
  ThreeSpeakUploadLimit
} from "@/api/threespeak-embed/upload-limits";

interface Props {
  /** Returns false when the dialog no longer belongs to the uploading account. */
  onEmbedUrlReady: (embedUrl: string, permlink: string, owner: string) => boolean;
  setSelectedFile: (v: string, mime: string) => void;
  onReset: () => void;
  isCurrentSession?: (owner: string) => boolean;
  /**
   * 3Speak refused the upload over the free daily limit; the recording is kept.
   * `owner` is the account that uploaded, which may no longer be the active one.
   */
  onLimitReached?: (limit: ThreeSpeakUploadLimit, owner: string) => void;
  isShort?: boolean;
}

export function VideoUploadRecorder({
  onEmbedUrlReady,
  onReset,
  setSelectedFile,
  onLimitReached,
  isCurrentSession,
  isShort
}: Props) {
  const { activeUser } = useActiveAccount();
  const isMounted = useMountedState();
  const [stream, setStream] = useState<MediaStream>();
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder>();
  const [recordedVideoSrc, setRecordedVideoSrc] = useState<string>();
  const [recordedBlob, setRecordedBlob] = useState<Blob>();
  const [noPermission, setNoPermission] = useState(false);
  const [currentCamera, setCurrentCamera] = useState<MediaDeviceInfo>();

  const ref = useRef<HTMLVideoElement | null>(null);
  const recordedVideoUrlRef = useRef<string | undefined>(undefined);
  const dataAvailableHandlerRef = useRef<((event: BlobEvent) => void) | null>(null);
  const previousMediaRecorderRef = useRef<MediaRecorder | null>(null);
  // The live camera stream, stopped on camera switch and on unmount.
  const streamRef = useRef<MediaStream | undefined>(undefined);
  // Bumped per camera request, so only the newest one may become the live stream.
  const streamRequestRef = useRef(0);
  // The recording's upload in flight, aborted when the recorder closes.
  const uploadAbortRef = useRef<AbortController | undefined>(undefined);

  const {
    mutateAsync: uploadVideo,
    completed,
    isPending: isLoading,
    isSuccess
  } = useThreeSpeakEmbedUpload();

  useUnmount(() => {
    // The dialog closed or the account switched: nobody will insert this upload.
    uploadAbortRef.current?.abort();
    // Invalidate any camera request still in flight, so it neither retries nor goes live.
    streamRequestRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = undefined;
    if (recordedVideoUrlRef.current) {
      URL.revokeObjectURL(recordedVideoUrlRef.current);
    }
    if (mediaRecorder && dataAvailableHandlerRef.current) {
      mediaRecorder.removeEventListener("dataavailable", dataAvailableHandlerRef.current);
    }
  });

  useEffect(() => {
    if (stream && ref.current) {
      ref.current.srcObject = stream;
    }
  }, [stream, ref]);

  const initStream = useCallback(
    async (mimeType: string, request: number) => {
      setNoPermission(false);

      try {
        if (recordedVideoUrlRef.current) {
          URL.revokeObjectURL(recordedVideoUrlRef.current);
          recordedVideoUrlRef.current = undefined;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: currentCamera ? { deviceId: currentCamera.deviceId } : true,
          audio: true
        });
        // The recorder closed, or a newer camera was chosen, while the browser
        // was asking for this one.
        if (!isMounted() || request !== streamRequestRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        let mediaRecorder: MediaRecorder;
        try {
          mediaRecorder = new MediaRecorder(stream, { mimeType });
        } catch (e) {
          // Unsupported mime type: release this stream before the fallback opens another.
          stream.getTracks().forEach((track) => track.stop());
          throw e;
        }

        if (previousMediaRecorderRef.current && dataAvailableHandlerRef.current) {
          previousMediaRecorderRef.current.removeEventListener(
            "dataavailable",
            dataAvailableHandlerRef.current
          );
        }

        const dataAvailableHandler = (event: BlobEvent) => {
          if (event.data.size > 0) {
            if (recordedVideoUrlRef.current) {
              URL.revokeObjectURL(recordedVideoUrlRef.current);
            }
            const blobUrl = URL.createObjectURL(event.data);
            recordedVideoUrlRef.current = blobUrl;
            setRecordedVideoSrc(blobUrl);
            setRecordedBlob(event.data);
            stream.getTracks().forEach((track) => track.stop());
          }
        };

        dataAvailableHandlerRef.current = dataAvailableHandler;
        mediaRecorder.addEventListener("dataavailable", dataAvailableHandler);

        previousMediaRecorderRef.current = mediaRecorder;
        streamRef.current = stream;
        setMediaRecorder(mediaRecorder);
        setStream(stream);
      } catch (e) {
        if (request === streamRequestRef.current) setNoPermission(true);
        throw e;
      }
    },
    [currentCamera, isMounted]
  );

  const initStreamSafe = useCallback(async () => {
    const request = ++streamRequestRef.current;
    try {
      await initStream("video/webm", request);
    } catch {
      // Superseded by a newer camera request, or the recorder closed.
      if (request !== streamRequestRef.current) return;
      try {
        await initStream("video/mp4", request);
      } catch {
        // Denied or no camera: initStream already shows the no-permission state.
      }
    }
  }, [initStream]);

  useEffect(() => {
    initStreamSafe();
  }, [currentCamera, initStreamSafe]);

  return (
    <div className="video-upload-recorder">
      {recordedBlob ? (
        <Button className="reset-btn" appearance="link" size="sm" onClick={() => onReset()}>
          {i18next.t("video-upload.reset")}
        </Button>
      ) : (
        <></>
      )}

      <VideoUploadRecorderActions
        noPermission={noPermission}
        mediaRecorder={mediaRecorder}
        recordButtonShow={!noPermission && !recordedVideoSrc}
        onCameraSelect={(camera) => {
          // Release camera and mic; the new request opens both again.
          streamRef.current?.getTracks().forEach((track) => track.stop());
          setCurrentCamera(camera);
        }}
      />

      {noPermission ? (
        <VideoUploadRecorderNoPermission />
      ) : (
        <>
          <video
            hidden={!recordedVideoSrc}
            controls={true}
            src={recordedVideoSrc}
            autoPlay={false}
            playsInline={true}
            id="videoRecorded"
          />
          <video
            hidden={!!recordedVideoSrc}
            ref={ref}
            muted={true}
            autoPlay={true}
            playsInline={true}
            id="videoLive"
          />
          {recordedVideoSrc ? (
            <div className="flex items-center justify-center mt-3">
              {recordedBlob && isSuccess ? (
                <div className="bg-success text-white p-3 text-sm rounded-pill w-100">
                  {i18next.t("video-upload.uploaded")}
                </div>
              ) : (
                <Button
                  disabled={isLoading}
                  onClick={async () => {
                    // isLoading disables the button only after a render, so
                    // a second click in the same frame must not start another.
                    if (!recordedBlob || !activeUser || uploadAbortRef.current) return;

                    const maxFileSizeBytes = 1 * 1024 * 1024 * 1024; // 1 GB
                    if (recordedBlob.size > maxFileSizeBytes) {
                      error(i18next.t("video-upload.file-too-large"));
                      return;
                    }

                    const abortController = new AbortController();
                    uploadAbortRef.current = abortController;
                    const owner = activeUser.username;
                    const isCurrent = () =>
                      isMounted() && (isCurrentSession?.(owner) ?? true);
                    try {
                      const mime = recordedBlob.type || "video/webm";
                      const ext = mime.includes("mp4") ? "mp4" : "webm";
                      const file = new File([recordedBlob], `ecency-recorder-${v4()}.${ext}`, {
                        type: mime
                      });
                      const result = await uploadVideo({
                        file,
                        owner,
                        isShort,
                        isCurrent,
                        signal: abortController.signal
                      });
                      if (
                        result &&
                        isCurrent() &&
                        onEmbedUrlReady(result.embedUrl, result.permlink, owner)
                      ) {
                        // The dialog owns this preview URL from here and revokes it.
                        setSelectedFile(URL.createObjectURL(file), mime);
                      }
                    } catch (e) {
                      if (isThreeSpeakUploadLimitError(e)) {
                        // The recorder unmounts when the dialog closes, so a
                        // refusal that lands later belongs to no open dialog.
                        if (isCurrent()) onLimitReached?.(e.limit, owner);
                        return;
                      }
                      if (isCurrent()) error(...formatError(e));
                    } finally {
                      // Settled: a retry after a failure may start again.
                      uploadAbortRef.current = undefined;
                    }
                  }}
                >
                  {isLoading
                    ? i18next.t("video-upload.uploading", { n: completed, total: 100 })
                    : i18next.t("video-upload.confirm-and-upload")}
                </Button>
              )}
            </div>
          ) : (
            <></>
          )}
        </>
      )}
    </div>
  );
}

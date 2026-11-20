import React, { useCallback, useEffect, useRef, useState } from "react";
import useMount from "react-use/lib/useMount";
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
  onEmbedUrlReady: (embedUrl: string, permlink: string) => void;
  setSelectedFile: (v: string, mime: string) => void;
  onReset: () => void;
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
  const selectedFileUrlRef = useRef<string | undefined>(undefined);
  const dataAvailableHandlerRef = useRef<((event: BlobEvent) => void) | null>(null);
  const previousMediaRecorderRef = useRef<MediaRecorder | null>(null);

  const {
    mutateAsync: uploadVideo,
    completed,
    isPending: isLoading,
    isSuccess
  } = useThreeSpeakEmbedUpload();

  useMount(() => initStreamSafe());

  useUnmount(() => {
    stream?.getTracks().forEach((track) => track.stop());
    if (recordedVideoUrlRef.current) {
      URL.revokeObjectURL(recordedVideoUrlRef.current);
    }
    if (selectedFileUrlRef.current) {
      URL.revokeObjectURL(selectedFileUrlRef.current);
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
    async (mimeType: string) => {
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
        const mediaRecorder = new MediaRecorder(stream, { mimeType });

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
        setMediaRecorder(mediaRecorder);
        setStream(stream);
      } catch (e) {
        setNoPermission(true);
        throw e;
      }
    },
    [currentCamera]
  );

  const initStreamSafe = useCallback(async () => {
    try {
      await initStream("video/webm");
    } catch (e) {
      await initStream("video/mp4");
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
          stream
            ?.getTracks()
            .filter(({ kind }) => kind === "video")
            .forEach((track) => track.stop());
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
                    if (!recordedBlob || !activeUser) return;

                    const maxFileSizeBytes = 1 * 1024 * 1024 * 1024; // 1 GB
                    if (recordedBlob.size > maxFileSizeBytes) {
                      error(i18next.t("video-upload.file-too-large"));
                      return;
                    }

                    const owner = activeUser.username;
                    try {
                      const mime = recordedBlob.type || "video/webm";
                      const ext = mime.includes("mp4") ? "mp4" : "webm";
                      const file = new File([recordedBlob], `ecency-recorder-${v4()}.${ext}`, {
                        type: mime
                      });
                      const result = await uploadVideo({
                        file,
                        owner,
                        isShort
                      });
                      if (result) {
                        onEmbedUrlReady(result.embedUrl, result.permlink);
                        if (selectedFileUrlRef.current) {
                          URL.revokeObjectURL(selectedFileUrlRef.current);
                        }
                        const fileUrl = URL.createObjectURL(file);
                        selectedFileUrlRef.current = fileUrl;
                        setSelectedFile(fileUrl, mime);
                      }
                    } catch (e) {
                      if (isThreeSpeakUploadLimitError(e)) {
                        // The recorder unmounts when the dialog closes, so a
                        // refusal that lands later belongs to no open dialog.
                        if (isMounted()) onLimitReached?.(e.limit, owner);
                        return;
                      }
                      error(...formatError(e));
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

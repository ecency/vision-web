"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { uploadVideoEmbed } from "./api";
import { VideoUploadResult } from "./types";
import { isThreeSpeakUploadLimitError } from "./upload-limits";
import { error } from "@/features/shared";
import i18next from "i18next";

export function useThreeSpeakEmbedUpload() {
  const [completed, setCompleted] = useState<number>(0);

  const mutation = useMutation({
    mutationKey: ["threeSpeakEmbedUpload"],
    mutationFn: async ({
      file,
      owner,
      isShort = false,
      isCurrent,
      signal
    }: {
      file: File;
      owner: string;
      isShort?: boolean;
      /** Whether this upload still belongs to the visible dialog session. */
      isCurrent?: () => boolean;
      /** Aborting it stops the upload and deletes the partial file on 3Speak. */
      signal?: AbortSignal;
    }): Promise<VideoUploadResult> => {
      try {
        const result = await uploadVideoEmbed(
          file,
          owner,
          isShort,
          (percentage) => {
            if (isCurrent?.() ?? true) setCompleted(percentage);
          },
          signal
        );
        return result;
      } catch (e) {
        // An aborted upload was abandoned on purpose: nothing to report.
        if (signal?.aborted || isCurrent?.() === false) throw e;
        // TUS errors expose status via originalResponse; fetch errors via .status
        const status =
          (e as any)?.originalResponse?.getStatus?.() ??
          (e as any)?.status ??
          undefined;

        // The daily limit is not a failure to report: the upload dialog shows
        // it inline, with the next upload time and the upgrade link.
        if (isThreeSpeakUploadLimitError(e)) {
          throw e;
        }

        console.error("[3Speak] Video upload failed:", { status, error: e });

        if (status === 413) {
          error(i18next.t("video-upload.error-too-large"));
        } else if (status === 429) {
          error(i18next.t("video-upload.error-too-many"));
        } else if (status === 503) {
          error(i18next.t("video-upload.error-unavailable"));
        } else if (status === 401 || status === 403) {
          error(i18next.t("video-upload.error-auth"));
        } else {
          error(i18next.t("video-upload.error-generic"));
        }
        throw e;
      } finally {
        if (isCurrent?.() ?? true) setCompleted(0);
      }
    }
  });

  return { ...mutation, completed, setCompleted };
}

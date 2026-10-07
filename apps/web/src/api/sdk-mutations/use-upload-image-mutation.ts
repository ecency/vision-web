"use client";

import { useAddImage, useUploadImage } from "@ecency/sdk";
import { useActiveUsername } from "@/core/hooks/use-active-username";
import { ensureValidToken } from "@/utils";
import { useMutation } from "@tanstack/react-query";
import { error, success } from "@/features/shared/feedback";
import i18next from "i18next";
import { EcencyConfigManager } from "@/config";
import {
  isTransientUploadError,
  reportUploadError,
  uploadErrorMessage,
  withUploadRetry
} from "./upload-image-retry";

/** Errors already shown by the Retry toast, so onError does not toast them twice. */
const reportedErrors = new WeakSet<object>();

function abortedError(): Error {
  const e = new Error("Aborted");
  e.name = "AbortError";
  return e;
}

/**
 * Web wrapper that combines SDK useUploadImage + useAddImage hooks.
 *
 * This hook:
 * 1. Uploads an image file to Ecency's image server (uses SDK hook)
 * 2. (Optionally) Adds the uploaded image URL to user's gallery if feature flag is enabled (uses SDK hook)
 * 3. Provides web-specific error handling for different HTTP status codes
 * 4. Shows success notification on completion
 *
 * @example
 * const uploadMutation = useUploadImageMutation();
 * uploadMutation.mutate({ file, signal });
 */
export function useUploadImageMutation() {
  const username = useActiveUsername();

  // SDK hooks
  const sdkUpload = useUploadImage();
  // Intentionally keep hook-level code undefined; a fresh access token is read
  // at execution time and passed per-call to mutateAsync({ url, code }).
  const sdkAddImage = useAddImage(username, undefined);

  // Feature-flagged add mutation
  const conditionalAdd = EcencyConfigManager.useConditionalMutation(
    ({ visionFeatures }) => visionFeatures.imageServer.enabled,
    {
      mutationKey: ["addPostImage"],
      mutationFn: async ({ url }: { url: string }) => {
        if (!url || url.length === 0) {
          throw new Error("URL missed");
        }
        if (!username) {
          throw new Error("Cannot add image without an active user");
        }

        const token = await ensureValidToken(username);
        if (!token) {
          throw new Error("Token missed");
        }

        await sdkAddImage.mutateAsync({ url, code: token });
      },
      onError: (e: Error) => {
        // Web-specific error handling for add
        if ("status" in e) {
          error(i18next.t("editor-toolbar.image-error-network"), undefined, { error: e });
        } else if (e.message === "Token missed") {
          error(i18next.t("g.image-error-cache"), undefined, { error: e });
        } else if (e.message === "URL missed") {
          error(i18next.t("editor-toolbar.image-error-url-missed"), undefined, { error: e });
        } else {
          error(i18next.t("editor-toolbar.image-error"), undefined, { error: e });
        }
      }
    }
  );

  // Combine upload + add operations
  return useMutation({
    mutationKey: ["uploadAndAddPostImage"],
    mutationFn: async ({ file, signal }: { file: File; signal?: AbortSignal }) => {
      if (!username) {
        throw new Error("Cannot upload image without an active user");
      }

      // One automatic retry for a temporary failure; if that fails too, the
      // Retry toast keeps this upload pending until the user retries (and the
      // caller gets the image as if the first try worked) or closes it.
      let response: Awaited<ReturnType<typeof sdkUpload.mutateAsync>>;
      for (;;) {
        // read per attempt: a Retry can come long after the first try
        const token = await ensureValidToken(username);
        if (!token) {
          throw new Error("Token missed");
        }
        try {
          response = await withUploadRetry(
            () => sdkUpload.mutateAsync({ file, token, signal }),
            signal
          );
          break;
        } catch (e) {
          if (!isTransientUploadError(e) || signal?.aborted) {
            throw e;
          }
          const retry = await reportUploadError(e, signal);
          if (signal?.aborted) {
            throw abortedError();
          }
          if (!retry) {
            reportedErrors.add(e as object);
            throw e;
          }
        }
      }

      // Try to add to gallery (non-blocking)
      try {
        await conditionalAdd.mutateAsync(response);
      } catch (e) {
        // images-add failure shouldn't block using the uploaded image
      }

      return response;
    },
    onSuccess: () => {
      success(i18next.t("ecency-images.success-upload"));
    },
    onError: (e: Error) => {
      // The caller aborted (dialog closed, upload cancelled) - it is not a failure
      // to report back, and the toast would contradict what the user just did
      if (e.name === "AbortError") {
        return;
      }

      // already shown with a Retry action the user closed
      if (reportedErrors.has(e)) {
        return;
      }

      if (e.message === "Token missed") {
        error(i18next.t("g.image-error-cache"), undefined, { error: e });
      } else {
        error(uploadErrorMessage(e), undefined, { error: e });
      }
    }
  });
}

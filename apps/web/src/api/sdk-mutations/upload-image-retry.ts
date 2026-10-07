import i18next from "i18next";
import { uploadImage } from "@ecency/sdk";
import { dismissFeedback, error } from "@/features/shared/feedback";
import { ensureValidToken } from "@/utils";

/** Statuses the image server answers when a retry can succeed (slow storage, slow account lookup). */
const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);

/** Pause before the single automatic retry. */
export const UPLOAD_RETRY_DELAY_MS = 1500;

/**
 * The HTTP status of a failed upload. The SDK's fetch errors carry it as
 * `status`; axios errors (older call sites) as `response.status`.
 */
export function uploadErrorStatus(e: unknown): number | undefined {
  if (!e || typeof e !== "object") {
    return undefined;
  }
  const status = (e as { status?: unknown }).status;
  if (typeof status === "number") {
    return status;
  }
  const responseStatus = (e as { response?: { status?: unknown } }).response?.status;
  return typeof responseStatus === "number" ? responseStatus : undefined;
}

function isAbort(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { name?: unknown }).name === "AbortError";
}

/**
 * fetch's network-failure TypeError, by message: "Failed to fetch" (Chromium),
 * "NetworkError when attempting to fetch resource." (Firefox), "Load failed"
 * (Safari), "Network request failed" (polyfills). Any other TypeError is a bug,
 * which a retry cannot fix.
 */
const NETWORK_FAILURE = /failed to fetch|networkerror|load failed|network request failed/i;

/**
 * True for a failure that may succeed on retry: a 5xx from the image server or
 * a network error. Never for 4xx, a cancellation by the caller, or a code bug.
 */
export function isTransientUploadError(e: unknown): boolean {
  if (isAbort(e)) {
    return false;
  }
  const status = uploadErrorStatus(e);
  if (status !== undefined) {
    return TRANSIENT_STATUSES.has(status);
  }
  return e instanceof TypeError && NETWORK_FAILURE.test(e.message);
}

function abortError(): Error {
  const e = new Error("Aborted");
  e.name = "AbortError";
  return e;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Runs an upload, and once more after a short pause if it failed in a way a
 * retry can fix. Uploads are content-addressed on the server, so sending the
 * same file twice cannot create a duplicate. `run` is called afresh for the
 * retry, so it should read the access token itself rather than close over one.
 */
export async function withUploadRetry<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (!isTransientUploadError(e) || signal?.aborted) {
      throw e;
    }
    await delay(UPLOAD_RETRY_DELAY_MS, signal);
    return run();
  }
}

/** The message for a failed upload, by status. */
export function uploadErrorMessage(e: unknown): string {
  const status = uploadErrorStatus(e);
  if (status === 413) {
    return i18next.t("editor-toolbar.image-error-size");
  }
  if (status === 429) {
    return i18next.t("editor-toolbar.image-error-quota");
  }
  if (status === 401 || status === 403) {
    return i18next.t("editor-toolbar.image-error-auth");
  }
  if (isTransientUploadError(e)) {
    return i18next.t("editor-toolbar.image-error-temporary");
  }
  return i18next.t("editor-toolbar.image-error");
}

/**
 * Shows a failed upload. A temporary failure gets a Retry button and the toast
 * stays until the user acts; resolves true when they chose Retry, false when
 * they closed it, the failure was not retryable, or `signal` aborted (which
 * also closes the toast).
 */
export function reportUploadError(e: unknown, signal?: AbortSignal): Promise<boolean> {
  if (!isTransientUploadError(e) || signal?.aborted) {
    error(uploadErrorMessage(e), undefined, { error: e });
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const settle = (retry: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      resolve(retry);
    };
    const id = error(uploadErrorMessage(e), undefined, {
      error: e,
      action: { label: i18next.t("g.retry"), onClick: () => settle(true) },
      onDismiss: () => settle(false)
    });
    const onAbort = () => {
      settle(false);
      dismissFeedback(id);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Uploads `file` as `username` for callers that use the SDK directly (waves,
 * decks): automatic retry, then the Retry toast, looping in place so a caller
 * that uploads several files in sequence keeps their order, and the account
 * is the one that started the upload. Shows its own error toasts; resolves the
 * image URL, or undefined when the upload failed or the user gave up.
 */
export async function uploadImageWithRetryPrompt(
  file: File,
  username: string,
  signal?: AbortSignal
): Promise<string | undefined> {
  const attempt = async () => {
    const token = await ensureValidToken(username);
    if (!token) {
      throw new Error("Token missed");
    }
    return uploadImage(file, token, signal);
  };
  for (;;) {
    try {
      const { url } = await withUploadRetry(attempt, signal);
      return url;
    } catch (e) {
      if (signal?.aborted) {
        return undefined;
      }
      if (e instanceof Error && e.message === "Token missed") {
        error(i18next.t("editor-toolbar.image-error-cache"));
        return undefined;
      }
      if (!(await reportUploadError(e, signal))) {
        return undefined;
      }
    }
  }
}

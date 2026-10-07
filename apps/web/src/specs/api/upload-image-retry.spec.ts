import { vi } from "vitest";
import {
  isTransientUploadError,
  uploadImageWithRetryPrompt,
  reportUploadError,
  uploadErrorMessage,
  uploadErrorStatus,
  UPLOAD_RETRY_DELAY_MS,
  withUploadRetry
} from "@/api/sdk-mutations/upload-image-retry";
import { FeedbackObject } from "@/features/shared/feedback/feedback-events";

// toast ids come from random(), which the global @/utils mock leaves returning undefined
let nextId = 0;
const ensureValidToken = vi.fn(async () => "token");
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  random: vi.fn(() => `toast-${++nextId}`),
  getAccessToken: vi.fn(() => "mock-token"),
  ensureValidToken: (...args: unknown[]) => ensureValidToken(...(args as []))
}));

const sdkUploadImage = vi.fn();
vi.mock("@ecency/sdk", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  uploadImage: (...args: unknown[]) => sdkUploadImage(...args)
}));

const httpError = (status: number) => Object.assign(new Error(`Request failed with status ${status}`), { status });
const abortError = () => Object.assign(new Error("Aborted"), { name: "AbortError" });

describe("upload-image-retry", () => {
  describe("classification", () => {
    it("reads the status from SDK fetch errors and from axios errors", () => {
      expect(uploadErrorStatus(httpError(504))).toBe(504);
      expect(uploadErrorStatus({ response: { status: 413 } })).toBe(413);
      expect(uploadErrorStatus(new Error("x"))).toBeUndefined();
    });

    it("treats 5xx and network failures as temporary, never 4xx or a cancellation", () => {
      for (const status of [500, 502, 503, 504]) {
        expect(isTransientUploadError(httpError(status))).toBe(true);
      }
      expect(isTransientUploadError(new TypeError("Failed to fetch"))).toBe(true);
      expect(isTransientUploadError(new TypeError("NetworkError when attempting to fetch resource."))).toBe(true);
      expect(isTransientUploadError(new TypeError("Load failed"))).toBe(true);
      // a code bug is not a network failure
      expect(isTransientUploadError(new TypeError("onAddImage is not a function"))).toBe(false);
      for (const status of [400, 401, 403, 413, 429]) {
        expect(isTransientUploadError(httpError(status))).toBe(false);
      }
      expect(isTransientUploadError(abortError())).toBe(false);
      expect(isTransientUploadError(new Error("Token missed"))).toBe(false);
    });

    it("picks the message by status", () => {
      expect(uploadErrorMessage(httpError(413))).toBe("editor-toolbar.image-error-size");
      expect(uploadErrorMessage({ response: { status: 413 } })).toBe("editor-toolbar.image-error-size");
      expect(uploadErrorMessage(httpError(429))).toBe("editor-toolbar.image-error-quota");
      expect(uploadErrorMessage(httpError(401))).toBe("editor-toolbar.image-error-auth");
      expect(uploadErrorMessage(httpError(504))).toBe("editor-toolbar.image-error-temporary");
      expect(uploadErrorMessage(new TypeError("Failed to fetch"))).toBe("editor-toolbar.image-error-temporary");
      expect(uploadErrorMessage(httpError(400))).toBe("editor-toolbar.image-error");
    });
  });

  describe("withUploadRetry", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("retries a temporary failure once after a pause", async () => {
      const run = vi.fn().mockRejectedValueOnce(httpError(504)).mockResolvedValueOnce({ url: "u" });
      const result = withUploadRetry(run);
      await vi.advanceTimersByTimeAsync(UPLOAD_RETRY_DELAY_MS - 1);
      expect(run).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toEqual({ url: "u" });
      expect(run).toHaveBeenCalledTimes(2);
    });

    it("retries only once", async () => {
      const run = vi.fn().mockRejectedValue(httpError(503));
      const result = withUploadRetry(run);
      const settled = expect(result).rejects.toMatchObject({ status: 503 });
      await vi.advanceTimersByTimeAsync(UPLOAD_RETRY_DELAY_MS * 3);
      await settled;
      expect(run).toHaveBeenCalledTimes(2);
    });

    it("does not retry a client error", async () => {
      const run = vi.fn().mockRejectedValue(httpError(413));
      await expect(withUploadRetry(run)).rejects.toMatchObject({ status: 413 });
      expect(run).toHaveBeenCalledTimes(1);
    });

    it("stops waiting when the caller aborts during the pause", async () => {
      const controller = new AbortController();
      const run = vi.fn().mockRejectedValue(httpError(504));
      const result = withUploadRetry(run, controller.signal);
      const settled = expect(result).rejects.toMatchObject({ name: "AbortError" });
      await vi.advanceTimersByTimeAsync(100);
      controller.abort();
      await settled;
      expect(run).toHaveBeenCalledTimes(1);
    });
  });

  describe("reportUploadError", () => {
    let toasts: FeedbackObject[];
    const onFeedback = (e: Event) => toasts.push((e as CustomEvent).detail);
    const dismissed: string[] = [];
    const onDismissRequest = (e: Event) => dismissed.push((e as CustomEvent).detail);

    beforeEach(() => {
      toasts = [];
      dismissed.length = 0;
      window.addEventListener("ecency-feedback", onFeedback);
      window.addEventListener("ecency-feedback-dismiss", onDismissRequest);
    });
    afterEach(() => {
      window.removeEventListener("ecency-feedback", onFeedback);
      window.removeEventListener("ecency-feedback-dismiss", onDismissRequest);
    });

    it("resolves true when the user chooses Retry", async () => {
      const decision = reportUploadError(httpError(504));
      expect(toasts).toHaveLength(1);
      expect(toasts[0].message).toBe("editor-toolbar.image-error-temporary");
      expect(toasts[0].action?.label).toBe("g.retry");
      toasts[0].action!.onClick();
      await expect(decision).resolves.toBe(true);
    });

    it("resolves false when the toast is closed", async () => {
      const decision = reportUploadError(new TypeError("Failed to fetch"));
      toasts[0].onDismiss!();
      await expect(decision).resolves.toBe(false);
    });

    it("shows a plain error with no action for a non-temporary failure", async () => {
      await expect(reportUploadError(httpError(413))).resolves.toBe(false);
      expect(toasts[0].message).toBe("editor-toolbar.image-error-size");
      expect(toasts[0].action).toBeUndefined();
    });

    it("closes the toast and resolves false when the caller aborts", async () => {
      const controller = new AbortController();
      const decision = reportUploadError(httpError(503), controller.signal);
      controller.abort();
      await expect(decision).resolves.toBe(false);
      expect(dismissed).toEqual([toasts[0].id]);
      // a late click on the closed toast changes nothing
      toasts[0].action!.onClick();
      await expect(decision).resolves.toBe(false);
    });
  });

  describe("uploadImageWithRetryPrompt", () => {
    let toasts: FeedbackObject[];
    const onFeedback = (e: Event) => toasts.push((e as CustomEvent).detail);
    const file = (name: string) => new File(["x"], name, { type: "image/png" });

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      toasts = [];
      sdkUploadImage.mockReset();
      ensureValidToken.mockClear();
      window.addEventListener("ecency-feedback", onFeedback);
    });
    afterEach(() => {
      window.removeEventListener("ecency-feedback", onFeedback);
      vi.useRealTimers();
    });

    it("waits for Retry in place, so files uploaded in sequence keep their order", async () => {
      sdkUploadImage.mockImplementation(async (f: File) => {
        if (f.name === "a.png" && sdkUploadImage.mock.calls.filter(([x]) => x.name === "a.png").length <= 2) {
          throw Object.assign(new Error("Request failed with status 504"), { status: 504 });
        }
        return { url: `https://img/${f.name}` };
      });
      const inserted: string[] = [];
      const sequence = (async () => {
        for (const f of [file("a.png"), file("b.png")]) {
          const url = await uploadImageWithRetryPrompt(f, "alice");
          if (url) inserted.push(url);
        }
      })();

      await vi.advanceTimersByTimeAsync(2000);
      expect(toasts.filter((t) => t.type === "error")).toHaveLength(1);
      // b has not started while a waits for the user
      expect(sdkUploadImage.mock.calls.map(([f]) => f.name)).toEqual(["a.png", "a.png"]);

      toasts[0].action!.onClick();
      await sequence;
      expect(inserted).toEqual(["https://img/a.png", "https://img/b.png"]);
      // a fresh token for every attempt: two failed, the retried one, then b
      expect(ensureValidToken).toHaveBeenCalledTimes(4);
      expect(ensureValidToken).toHaveBeenCalledWith("alice");
    });

    it("resolves undefined when the user closes the Retry toast", async () => {
      sdkUploadImage.mockRejectedValue(Object.assign(new Error("x"), { status: 503 }));
      const result = uploadImageWithRetryPrompt(file("a.png"), "alice");
      await vi.advanceTimersByTimeAsync(2000);
      toasts[0].onDismiss!();
      await expect(result).resolves.toBeUndefined();
    });

    it("shows the signed-out message when there is no token", async () => {
      ensureValidToken.mockResolvedValueOnce(undefined as unknown as string);
      await expect(uploadImageWithRetryPrompt(file("a.png"), "alice")).resolves.toBeUndefined();
      expect(toasts[0].message).toBe("editor-toolbar.image-error-cache");
      expect(sdkUploadImage).not.toHaveBeenCalled();
    });
  });
});

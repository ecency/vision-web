import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import { FeedbackObject } from "@/features/shared/feedback/feedback-events";

const sdkUpload = vi.fn();

vi.mock("@ecency/sdk", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useUploadImage: () => ({ mutateAsync: sdkUpload }),
  useAddImage: () => ({ mutateAsync: vi.fn(async () => ({})) })
}));

vi.mock("@/core/hooks/use-active-username", () => ({ useActiveUsername: () => "alice" }));

let nextId = 0;
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils")),
  random: vi.fn(() => `toast-${++nextId}`),
  ensureValidToken: vi.fn(async () => "token")
}));

// the gallery add is a side step; keep it inert
vi.mock("@/config", () => ({
  EcencyConfigManager: { useConditionalMutation: () => ({ mutateAsync: vi.fn(async () => undefined) }) }
}));

import { useUploadImageMutation } from "@/api/sdk-mutations/use-upload-image-mutation";

const httpError = (status: number) => Object.assign(new Error(`Request failed with status ${status}`), { status });
const file = new File(["x"], "a.png", { type: "image/png" });

describe("useUploadImageMutation retry", () => {
  let toasts: FeedbackObject[];
  const onFeedback = (e: Event) => toasts.push((e as CustomEvent).detail);

  const render = () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    return renderHook(() => useUploadImageMutation(), {
      wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    });
  };

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    toasts = [];
    sdkUpload.mockReset();
    window.addEventListener("ecency-feedback", onFeedback);
  });
  afterEach(() => {
    window.removeEventListener("ecency-feedback", onFeedback);
    vi.useRealTimers();
  });

  const errorToasts = () => toasts.filter((t) => t.type === "error");

  it("recovers silently when the automatic retry succeeds", async () => {
    sdkUpload.mockRejectedValueOnce(httpError(504)).mockResolvedValueOnce({ url: "https://img/a.png" });
    const { result } = render();

    let upload!: Promise<unknown>;
    act(() => {
      upload = result.current.mutateAsync({ file });
    });
    await act(() => vi.advanceTimersByTimeAsync(2000));

    await expect(upload).resolves.toEqual({ url: "https://img/a.png" });
    expect(sdkUpload).toHaveBeenCalledTimes(2);
    expect(errorToasts()).toHaveLength(0);
  });

  it("completes the ORIGINAL upload when the user presses Retry after both tries failed", async () => {
    sdkUpload
      .mockRejectedValueOnce(httpError(504))
      .mockRejectedValueOnce(httpError(504))
      .mockResolvedValueOnce({ url: "https://img/a.png" });
    const { result } = render();

    let upload!: Promise<unknown>;
    act(() => {
      upload = result.current.mutateAsync({ file });
    });
    await act(() => vi.advanceTimersByTimeAsync(2000));

    await waitFor(() => expect(errorToasts()).toHaveLength(1));
    expect(errorToasts()[0].message).toBe("editor-toolbar.image-error-temporary");

    // the caller's promise is still pending, waiting for the user's decision
    act(() => errorToasts()[0].action!.onClick());

    await expect(upload).resolves.toEqual({ url: "https://img/a.png" });
    expect(sdkUpload).toHaveBeenCalledTimes(3);
    expect(errorToasts()).toHaveLength(1);
  });

  it("rejects without a second toast when the user closes the Retry toast", async () => {
    sdkUpload.mockRejectedValue(httpError(503));
    const { result } = render();

    let upload!: Promise<unknown>;
    act(() => {
      upload = result.current.mutateAsync({ file });
    });
    const settled = expect(upload).rejects.toMatchObject({ status: 503 });
    await act(() => vi.advanceTimersByTimeAsync(2000));
    await waitFor(() => expect(errorToasts()).toHaveLength(1));

    act(() => errorToasts()[0].onDismiss!());
    await settled;
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(errorToasts()).toHaveLength(1);
  });

  it("fails straight away with the size message on 413", async () => {
    sdkUpload.mockRejectedValue(httpError(413));
    const { result } = render();

    let upload!: Promise<unknown>;
    act(() => {
      upload = result.current.mutateAsync({ file });
    });
    await expect(upload).rejects.toMatchObject({ status: 413 });
    await waitFor(() => expect(errorToasts()).toHaveLength(1));
    expect(errorToasts()[0].message).toBe("editor-toolbar.image-error-size");
    expect(errorToasts()[0].action).toBeUndefined();
    expect(sdkUpload).toHaveBeenCalledTimes(1);
  });
});

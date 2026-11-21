import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThreeSpeakUploadLimitError } from "@/api/threespeak-embed/upload-limits";

const mocks = vi.hoisted(() => ({ uploadVideoEmbed: vi.fn(), toastError: vi.fn() }));

vi.mock("@/api/threespeak-embed/api", () => ({ uploadVideoEmbed: mocks.uploadVideoEmbed }));
vi.mock("@/features/shared", () => ({ error: mocks.toastError }));

import { useThreeSpeakEmbedUpload } from "@/api/threespeak-embed/mutations";

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useThreeSpeakEmbedUpload(), { wrapper }).result;
}

const file = () => new File(["x"], "clip.mp4", { type: "video/mp4" });

describe("useThreeSpeakEmbedUpload", () => {
  beforeEach(() => {
    mocks.uploadVideoEmbed.mockReset();
    mocks.toastError.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rethrows the daily limit without a generic toast, after one attempt", async () => {
    const limitError = new ThreeSpeakUploadLimitError({
      code: "daily_upload_limit",
      kind: "video",
      limit: 1,
      used: 1,
      nextAt: "2026-11-21T14:32:00Z",
      retryAfterSeconds: 52320,
      message: "Free accounts can upload 1 video per 24 hours.",
      upgradeUrl: "https://3speak.tv/wallet/alice#pro"
    });
    mocks.uploadVideoEmbed.mockRejectedValue(limitError);
    const result = setup();

    await expect(result.current.mutateAsync({ file: file(), owner: "alice" })).rejects.toBe(
      limitError
    );
    expect(mocks.uploadVideoEmbed).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("keeps the rate-limit toast for a plain 429", async () => {
    const err = Object.assign(new Error("429"), { status: 429 });
    mocks.uploadVideoEmbed.mockRejectedValue(err);
    const result = setup();

    await expect(result.current.mutateAsync({ file: file(), owner: "alice" })).rejects.toBe(err);
    expect(mocks.toastError).toHaveBeenCalledWith("video-upload.error-too-many");
  });

  it("ignores progress, errors and final resets from an old account's upload", async () => {
    const attempts: Array<{
      progress: (percentage: number) => void;
      resolve: (result: { embedUrl: string; permlink: string }) => void;
      reject: (error: Error) => void;
    }> = [];
    mocks.uploadVideoEmbed.mockImplementation(
      (_file, _owner, _isShort, progress: (percentage: number) => void) =>
        new Promise((resolve, reject) => attempts.push({ progress, resolve, reject }))
    );
    const result = setup();
    let activeOwner = "alice";
    const aliceUpload = result.current.mutateAsync({
      file: file(), owner: "alice", isCurrent: () => activeOwner === "alice"
    });
    await waitFor(() => expect(attempts).toHaveLength(1));

    activeOwner = "bob";
    const bobUpload = result.current.mutateAsync({
      file: file(), owner: "bob", isCurrent: () => activeOwner === "bob"
    });
    await waitFor(() => expect(attempts).toHaveLength(2));
    act(() => attempts[1].progress(30));
    expect(result.current.completed).toBe(30);

    act(() => attempts[0].progress(75));
    expect(result.current.completed).toBe(30);
    const oldError = new Error("old upload failed");
    await act(async () => {
      attempts[0].reject(oldError);
      await expect(aliceUpload).rejects.toBe(oldError);
    });
    expect(result.current.completed).toBe(30);
    expect(mocks.toastError).not.toHaveBeenCalled();

    await act(async () => {
      attempts[1].resolve({ embedUrl: "https://play.3speak.tv/embed?v=bob/abc", permlink: "abc" });
      await bobUpload;
    });
    expect(result.current.completed).toBe(0);
  });
});

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
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
});

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  ThreeSpeakUploadLimit,
  ThreeSpeakUploadLimitError
} from "@/api/threespeak-embed/upload-limits";

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: vi.fn(() => ({ activeUser: { username: "alice" }, username: "alice" }))
}));

const mocks = vi.hoisted(() => ({
  uploadVideo: vi.fn(),
  toastError: vi.fn()
}));

vi.mock("@/api/threespeak-embed", () => ({
  useThreeSpeakEmbedUpload: () => ({
    mutateAsync: mocks.uploadVideo,
    completed: 0,
    isPending: false,
    isSuccess: false
  })
}));

vi.mock("@/features/shared/feedback", () => ({ error: mocks.toastError }));
vi.mock("@/api/format-error", () => ({ formatError: (e: unknown) => [String(e)] }));

// The record and camera buttons are not under test; the recording is delivered
// straight through the MediaRecorder's dataavailable event below.
vi.mock("@/features/shared/video-upload-threespeak/video-upload-recorder-actions", () => ({
  VideoUploadRecorderActions: () => null
}));

import { VideoUploadRecorder } from "@/features/shared/video-upload-threespeak/video-upload-recorder";

const refusal: ThreeSpeakUploadLimit = {
  code: "daily_upload_limit",
  kind: "short",
  limit: 3,
  used: 3,
  nextAt: "2026-11-21T14:32:00Z",
  retryAfterSeconds: 52320,
  message: "Free accounts can upload 3 shorts per 24 hours.",
  upgradeUrl: "https://3speak.tv/wallet/alice#pro"
};

type DataHandler = (event: { data: Blob }) => void;
let dataHandler: DataHandler | null = null;

class FakeMediaRecorder {
  constructor(_stream: unknown, _options: unknown) {}
  addEventListener(type: string, handler: DataHandler) {
    if (type === "dataavailable") dataHandler = handler;
  }
  removeEventListener() {}
  start() {}
  stop() {}
}

const fakeStream = { getTracks: () => [{ kind: "video", stop: vi.fn() }] };

/** Renders the recorder and hands it a finished recording. */
async function renderWithRecording(props: Partial<React.ComponentProps<typeof VideoUploadRecorder>> = {}) {
  const onLimitReached = vi.fn();
  const view = render(
    <VideoUploadRecorder
      isShort={true}
      onEmbedUrlReady={vi.fn()}
      setSelectedFile={vi.fn()}
      onReset={vi.fn()}
      onLimitReached={onLimitReached}
      {...props}
    />
  );
  await waitFor(() => expect(dataHandler).not.toBeNull());
  act(() => dataHandler!({ data: new Blob(["x"], { type: "video/webm" }) }));
  const upload = await screen.findByRole("button", { name: "video-upload.confirm-and-upload" });
  return { ...view, upload, onLimitReached };
}

describe("VideoUploadRecorder and the 3Speak daily upload limit", () => {
  beforeEach(() => {
    dataHandler = null;
    mocks.uploadVideo.mockReset();
    mocks.toastError.mockReset();
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn(async () => fakeStream) }
    });
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:rec"), revokeObjectURL: vi.fn() }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a refusal reaches onLimitReached with the uploading account, keeps the recording and shows no toast", async () => {
    mocks.uploadVideo.mockRejectedValue(new ThreeSpeakUploadLimitError(refusal));
    const { upload, onLimitReached } = await renderWithRecording();

    fireEvent.click(upload);

    await waitFor(() => expect(onLimitReached).toHaveBeenCalledWith(refusal, "alice"));
    expect(mocks.uploadVideo).toHaveBeenCalledTimes(1);
    expect(mocks.uploadVideo).toHaveBeenCalledWith(expect.objectContaining({ owner: "alice", isShort: true }));
    expect(mocks.toastError).not.toHaveBeenCalled();
    // The recording is still there to upload later.
    expect(screen.getByRole("button", { name: "video-upload.confirm-and-upload" })).toBeTruthy();
  });

  it("a refusal that lands after the recorder closed is dropped", async () => {
    let rejectUpload: (e: unknown) => void = () => {};
    mocks.uploadVideo.mockImplementation(
      () => new Promise((_resolve, reject) => { rejectUpload = reject; })
    );
    const { upload, onLimitReached, unmount } = await renderWithRecording();

    fireEvent.click(upload);
    await waitFor(() => expect(mocks.uploadVideo).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => {
      rejectUpload(new ThreeSpeakUploadLimitError(refusal));
    });

    expect(onLimitReached).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("any other failure still shows the error toast", async () => {
    mocks.uploadVideo.mockRejectedValue(new Error("network down"));
    const { upload, onLimitReached } = await renderWithRecording();

    fireEvent.click(upload);

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
    expect(onLimitReached).not.toHaveBeenCalled();
  });
});

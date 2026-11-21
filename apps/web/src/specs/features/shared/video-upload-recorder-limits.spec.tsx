import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderWithQueryClient, setupModalContainers, cleanupModalContainers } from "@/specs/test-utils";
import {
  ThreeSpeakUploadLimit,
  ThreeSpeakUploadLimitError
} from "@/api/threespeak-embed/upload-limits";

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: vi.fn(() => ({ activeUser: { username: "alice" }, username: "alice" }))
}));

const mocks = vi.hoisted(() => ({
  uploadVideo: vi.fn(),
  toastError: vi.fn(),
  getUploadQuota: vi.fn()
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
// What the surrounding upload dialog needs, for the end-to-end recorder case.
vi.mock("@/features/shared", () => ({ error: mocks.toastError }));
vi.mock("@/api/threespeak-embed/api", () => ({
  getUploadQuota: mocks.getUploadQuota,
  setVideoThumbnail: vi.fn()
}));
vi.mock("@/api/sdk-mutations", () => ({
  useUploadImageMutation: () => ({ mutateAsync: vi.fn(), isPending: false })
}));
vi.mock("@/core/global-store", () => ({
  useGlobalStore: (pick: (s: { toggleUiProp: () => void }) => unknown) => pick({ toggleUiProp: vi.fn() })
}));
vi.mock("@/api/format-error", () => ({ formatError: (e: unknown) => [String(e)] }));

// The record and camera buttons are not under test; the recording is delivered
// straight through the MediaRecorder's dataavailable event below.
vi.mock("@/features/shared/video-upload-threespeak/video-upload-recorder-actions", () => ({
  VideoUploadRecorderActions: (props: { onCameraSelect: (camera: MediaDeviceInfo) => void }) => {
    actionsProps.onCameraSelect = props.onCameraSelect;
    return null;
  }
}));
const actionsProps: { onCameraSelect?: (camera: MediaDeviceInfo) => void } = {};

import { VideoUploadRecorder } from "@/features/shared/video-upload-threespeak/video-upload-recorder";
import { VideoUpload } from "@/features/shared/video-upload-threespeak";

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

  it("a successful upload that lands after the recorder closed is dropped", async () => {
    let resolveUpload: (result: { embedUrl: string; permlink: string }) => void = () => {};
    mocks.uploadVideo.mockImplementation(
      () => new Promise((resolve) => { resolveUpload = resolve; })
    );
    const onEmbedUrlReady = vi.fn(() => true);
    const setSelectedFile = vi.fn();
    const { upload, unmount } = await renderWithRecording({ onEmbedUrlReady, setSelectedFile });

    fireEvent.click(upload);
    await waitFor(() => expect(mocks.uploadVideo).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => {
      resolveUpload({ embedUrl: "https://play.3speak.tv/embed?v=alice/abc", permlink: "abc" });
    });

    expect(onEmbedUrlReady).not.toHaveBeenCalled();
    expect(setSelectedFile).not.toHaveBeenCalled();
  });

  it("any other failure still shows the error toast", async () => {
    mocks.uploadVideo.mockRejectedValue(new Error("network down"));
    const { upload, onLimitReached } = await renderWithRecording();

    fireEvent.click(upload);

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
    expect(onLimitReached).not.toHaveBeenCalled();
  });
});

describe("VideoUploadRecorder releases the camera", () => {
  const streams: Array<{ deviceId?: string; tracks: Array<{ kind: string; stop: ReturnType<typeof vi.fn> }> }> = [];
  const pending: Array<() => void> = [];

  function newStream(deviceId?: string) {
    const tracks = [
      { kind: "video", stop: vi.fn() },
      { kind: "audio", stop: vi.fn() }
    ];
    const stream = { deviceId, tracks, getTracks: () => tracks };
    streams.push(stream);
    return stream;
  }

  beforeEach(() => {
    streams.length = 0;
    pending.length = 0;
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:rec"), revokeObjectURL: vi.fn() }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const allStopped = () =>
    streams.every((s) => s.tracks.every((t) => t.stop.mock.calls.length > 0));

  it("stops every stream it opened once it closes", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn(async () => newStream()) }
    });
    const { unmount } = render(
      <VideoUploadRecorder onEmbedUrlReady={vi.fn(() => true)} setSelectedFile={vi.fn()} onReset={vi.fn()} />
    );
    await waitFor(() => expect(streams.length).toBeGreaterThan(0));
    await act(async () => {});
    unmount();

    expect(allStopped()).toBe(true);
  });

  it("stops a stream granted after the recorder closed", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn(() => new Promise((resolve) => pending.push(() => resolve(newStream()))))
      }
    });
    const { unmount } = render(
      <VideoUploadRecorder onEmbedUrlReady={vi.fn(() => true)} setSelectedFile={vi.fn()} onReset={vi.fn()} />
    );
    await waitFor(() => expect(pending.length).toBeGreaterThan(0));
    unmount();
    await act(async () => {
      pending.forEach((grant) => grant());
    });

    expect(streams.length).toBeGreaterThan(0);
    expect(allStopped()).toBe(true);
  });

  it("stops a stream whose recorder could not be created before trying the fallback", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn(async () => newStream()) }
    });
    vi.stubGlobal(
      "MediaRecorder",
      class extends FakeMediaRecorder {
        constructor(stream: unknown, options: { mimeType: string }) {
          super(stream, options);
          if (options.mimeType === "video/webm") throw new Error("unsupported");
        }
      }
    );
    render(<VideoUploadRecorder onEmbedUrlReady={vi.fn(() => true)} setSelectedFile={vi.fn()} onReset={vi.fn()} />);
    await waitFor(() => expect(streams.length).toBe(2));
    await act(async () => {});

    expect(streams[0].tracks.every((t) => t.stop.mock.calls.length > 0)).toBe(true);
    expect(streams[1].tracks.every((t) => t.stop.mock.calls.length === 0)).toBe(true);
  });

  it("keeps the most recently chosen camera when an older grant lands last", async () => {
    const grants: Array<{ deviceId?: string; grant: () => void }> = [];
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn(
          (constraints: { video: true | { deviceId: string } }) =>
            new Promise((resolve) => {
              const deviceId = constraints.video === true ? undefined : constraints.video.deviceId;
              grants.push({ deviceId, grant: () => resolve(newStream(deviceId)) });
            })
        )
      }
    });
    render(<VideoUploadRecorder onEmbedUrlReady={vi.fn(() => true)} setSelectedFile={vi.fn()} onReset={vi.fn()} />);
    await waitFor(() => expect(grants.length).toBe(1));
    await act(async () => grants[0].grant());
    await waitFor(() => expect(actionsProps.onCameraSelect).toBeDefined());

    act(() => actionsProps.onCameraSelect!({ deviceId: "front" } as MediaDeviceInfo));
    await waitFor(() => expect(grants.length).toBe(2));
    act(() => actionsProps.onCameraSelect!({ deviceId: "back" } as MediaDeviceInfo));
    await waitFor(() => expect(grants.length).toBe(3));

    // "back" is granted first, then the stale "front" request lands.
    await act(async () => grants[2].grant());
    await act(async () => grants[1].grant());

    const byDevice = (id?: string) => streams.find((stream) => stream.deviceId === id)!;
    const [initial, front, back] = [byDevice(undefined), byDevice("front"), byDevice("back")];
    expect(initial.tracks.every((t) => t.stop.mock.calls.length > 0)).toBe(true);
    expect(back.tracks.every((t) => t.stop.mock.calls.length === 0)).toBe(true);
    expect(front.tracks.every((t) => t.stop.mock.calls.length > 0)).toBe(true);
  });

  it("a stale camera request failing late neither retries nor hides the newer denial", async () => {
    const requests: Array<{ deviceId?: string; deny: () => void }> = [];
    const getUserMedia = vi.fn(
      (constraints: { video: true | { deviceId: string } }) =>
        new Promise((_resolve, reject) => {
          const deviceId = constraints.video === true ? undefined : constraints.video.deviceId;
          requests.push({ deviceId, deny: () => reject(new DOMException("denied", "NotAllowedError")) });
        })
    );
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
    render(<VideoUploadRecorder onEmbedUrlReady={vi.fn(() => true)} setSelectedFile={vi.fn()} onReset={vi.fn()} />);
    await waitFor(() => expect(requests.length).toBe(1));
    await waitFor(() => expect(actionsProps.onCameraSelect).toBeDefined());

    // The newer camera is denied on both mime types...
    act(() => actionsProps.onCameraSelect!({ deviceId: "back" } as MediaDeviceInfo));
    await waitFor(() => expect(requests.length).toBe(2));
    await act(async () => requests[1].deny());
    await waitFor(() => expect(requests.length).toBe(3));
    await act(async () => requests[2].deny());
    expect(screen.getByText("video-upload.no-record-permission")).toBeTruthy();

    // ...then the stale first request fails.
    await act(async () => requests[0].deny());

    expect(getUserMedia).toHaveBeenCalledTimes(3);
    expect(screen.getByText("video-upload.no-record-permission")).toBeTruthy();
  });

  it("asks twice and shows the no-permission state when the camera is denied", async () => {
    const getUserMedia = vi.fn(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      render(<VideoUploadRecorder onEmbedUrlReady={vi.fn(() => true)} setSelectedFile={vi.fn()} onReset={vi.fn()} />);
      await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
      expect(screen.getByText("video-upload.no-record-permission")).toBeTruthy();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("leaves the preview it handed to the dialog alive when it closes", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn(async () => newStream()) }
    });
    let n = 0;
    const revoke = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => `blob:${++n}`), revokeObjectURL: revoke }));
    mocks.uploadVideo.mockResolvedValue({ embedUrl: "https://play.3speak.tv/embed?v=alice/abc", permlink: "abc" });
    const setSelectedFile = vi.fn();
    const { upload, unmount } = await renderWithRecording({ onEmbedUrlReady: vi.fn(() => true), setSelectedFile });

    fireEvent.click(upload);
    await waitFor(() => expect(setSelectedFile).toHaveBeenCalledTimes(1));
    const handedOver = setSelectedFile.mock.calls[0][0];
    unmount();

    expect(revoke).not.toHaveBeenCalledWith(handedOver);
  });
});

describe("VideoUpload dialog, recording refused over the daily limit", () => {
  beforeEach(() => {
    setupModalContainers();
    dataHandler = null;
    mocks.uploadVideo.mockReset();
    mocks.toastError.mockReset();
    mocks.getUploadQuota.mockReset();
    mocks.getUploadQuota.mockResolvedValue(null);
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn(async () => fakeStream) }
    });
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:rec"), revokeObjectURL: vi.fn() }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanupModalContainers();
  });

  it("shows the limit notice in the dialog and keeps the clip for playback and a later retry", async () => {
    mocks.uploadVideo.mockRejectedValue(new ThreeSpeakUploadLimitError(refusal));
    renderWithQueryClient(
      <VideoUpload show={true} setShow={vi.fn()} onVideoUploaded={vi.fn()} isShort={true} />
    );

    fireEvent.click(await screen.findByRole("button", { name: /video-upload\.record-video/ }));
    await waitFor(() => expect(dataHandler).not.toBeNull());
    act(() => dataHandler!({ data: new Blob(["x"], { type: "video/webm" }) }));
    fireEvent.click(await screen.findByRole("button", { name: "video-upload.confirm-and-upload" }));

    const notice = await screen.findByRole("alert");
    expect(notice.textContent).toContain("video-upload.limit-reached");
    expect(screen.getByRole("link", { name: "video-upload.limit-upgrade" }).getAttribute("href")).toBe(
      "https://3speak.tv/wallet/alice#pro"
    );
    expect(mocks.uploadVideo).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).not.toHaveBeenCalled();
    // The recorded clip is still on screen, with its upload button for a retry.
    expect(document.getElementById("videoRecorded")?.getAttribute("src")).toBe("blob:rec");
    expect(screen.getByRole("button", { name: "video-upload.confirm-and-upload" })).toBeTruthy();
  });
});

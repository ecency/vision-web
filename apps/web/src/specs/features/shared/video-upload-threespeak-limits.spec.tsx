import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithQueryClient, setupModalContainers, cleanupModalContainers } from "@/specs/test-utils";
import {
  ThreeSpeakUploadLimit,
  ThreeSpeakUploadLimitError
} from "@/api/threespeak-embed/upload-limits";

// Keys as-is, with the interpolation params appended so counts and times stay assertable.
vi.mock("i18next", () => ({
  __esModule: true,
  default: {
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(",")}` : key,
    language: "en-US"
  }
}));

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: vi.fn(() => ({ activeUser: { username: "alice" }, username: "alice" }))
}));

const mocks = vi.hoisted(() => ({
  uploadVideo: vi.fn(),
  uploadThumbnailImage: vi.fn(),
  getUploadQuota: vi.fn(),
  toastError: vi.fn()
}));

vi.mock("@/api/threespeak-embed", () => ({
  useThreeSpeakEmbedUpload: () => ({
    mutateAsync: mocks.uploadVideo,
    completed: 0,
    setCompleted: vi.fn(),
    isPending: false,
    isSuccess: false
  })
}));

vi.mock("@/api/threespeak-embed/api", () => ({
  getUploadQuota: mocks.getUploadQuota,
  setVideoThumbnail: vi.fn()
}));

vi.mock("@/api/sdk-mutations", () => ({
  useUploadImageMutation: () => ({ mutateAsync: mocks.uploadThumbnailImage, isPending: false })
}));

vi.mock("@/core/global-store", () => ({
  useGlobalStore: (pick: (s: any) => unknown) => pick({ toggleUiProp: vi.fn() })
}));

vi.mock("@/features/shared", () => ({ error: mocks.toastError }));

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { VideoUpload } from "@/features/shared/video-upload-threespeak";
import { getUploadLimitText } from "@/features/shared/video-upload-threespeak/video-upload-limit-notice";

const refusal = (overrides: Partial<ThreeSpeakUploadLimit> = {}): ThreeSpeakUploadLimit => ({
  code: "daily_upload_limit",
  kind: "video",
  limit: 1,
  used: 1,
  nextAt: "2026-11-21T14:32:00Z",
  retryAfterSeconds: 52320,
  message: "Free accounts can upload 1 video per 24 hours.",
  upgradeUrl: "https://3speak.tv/wallet/alice#pro",
  ...overrides
});

const renderDialog = (props: Partial<React.ComponentProps<typeof VideoUpload>> = {}) =>
  renderWithQueryClient(
    <VideoUpload show={true} setShow={vi.fn()} onVideoUploaded={vi.fn()} {...props} />
  );

const pickFile = () => {
  const input = document.getElementById("video-input") as HTMLInputElement;
  const file = new File(["x"], "clip.mp4", { type: "video/mp4" });
  fireEvent.change(input, { target: { files: [file] } });
};

describe("VideoUpload and the 3Speak daily upload limit", () => {
  beforeEach(() => {
    setupModalContainers();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
    mocks.uploadVideo.mockReset();
    mocks.uploadThumbnailImage.mockReset();
    mocks.getUploadQuota.mockReset();
    mocks.toastError.mockReset();
  });

  afterEach(() => {
    cleanupModalContainers();
  });

  it("a 429 shows the limit notice with the upgrade link, and no error toast", async () => {
    mocks.getUploadQuota.mockResolvedValue(null);
    mocks.uploadVideo.mockRejectedValue(new ThreeSpeakUploadLimitError(refusal()));
    renderDialog();

    pickFile();

    const notice = await screen.findByRole("alert");
    expect(notice.textContent).toContain("video-upload.limit-reached");
    expect(notice.textContent).toContain("video-upload.limit-video:1");
    expect(notice.textContent).toContain("video-upload.limit-next:");
    const link = screen.getByRole("link", { name: "video-upload.limit-upgrade" });
    expect(link.getAttribute("href")).toBe("https://3speak.tv/wallet/alice#pro");
    expect(link.getAttribute("target")).toBe("_blank");
    // One attempt, no automatic retry, no generic toast.
    expect(mocks.uploadVideo).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).not.toHaveBeenCalled();
    // The picker is back, so nothing is lost and the user can try again later.
    expect(document.getElementById("video-input")).not.toBeNull();
  });

  it("warns before a file is picked when the quota says nothing is left", async () => {
    mocks.getUploadQuota.mockResolvedValue({
      enabled: true,
      exempt: false,
      video: { limit: 1, used: 1, remaining: 0, nextAt: "2026-11-21T14:32:00Z" },
      short: { limit: 3, used: 0, remaining: 3, nextAt: null }
    });
    renderDialog();

    const notice = await screen.findByRole("alert");
    expect(notice.textContent).toContain("video-upload.limit-video:1");
    // The quota carries no upgrade URL, so the notice links the owner's 3Speak wallet.
    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "https://3speak.tv/wallet/alice#pro"
    );
    expect(mocks.getUploadQuota).toHaveBeenCalledWith("alice");
    // Not blocking: the picker stays usable.
    expect(document.getElementById("video-input")).not.toBeNull();
  });

  it("shows no notice for a short when only the video slots are used up", async () => {
    mocks.getUploadQuota.mockResolvedValue({
      enabled: true,
      exempt: false,
      video: { limit: 1, used: 1, remaining: 0, nextAt: "2026-11-21T14:32:00Z" },
      short: { limit: 3, used: 0, remaining: 3, nextAt: null }
    });
    renderDialog({ isShort: true });

    await waitFor(() => expect(mocks.getUploadQuota).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("an exempt account never sees the notice", async () => {
    mocks.getUploadQuota.mockResolvedValue({
      enabled: true,
      exempt: true,
      video: { limit: null, used: 4, remaining: null, nextAt: null },
      short: { limit: null, used: 0, remaining: null, nextAt: null }
    });
    renderDialog();

    await waitFor(() => expect(mocks.getUploadQuota).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a failed quota fetch does not block the upload", async () => {
    // getUploadQuota resolves null on any error (404, network, no login).
    mocks.getUploadQuota.mockResolvedValue(null);
    mocks.uploadVideo.mockResolvedValue({ embedUrl: "https://play.3speak.tv/embed?v=alice/abc", permlink: "abc" });
    renderDialog();

    await waitFor(() => expect(mocks.getUploadQuota).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
    pickFile();

    await waitFor(() =>
      expect(mocks.uploadVideo).toHaveBeenCalledWith(
        expect.objectContaining({ owner: "alice", isShort: false })
      )
    );
  });
});

describe("VideoUpload limit refusals stay with their account and dialog session", () => {
  beforeEach(() => {
    setupModalContainers();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
    mocks.uploadVideo.mockReset();
    mocks.uploadThumbnailImage.mockReset();
    mocks.getUploadQuota.mockReset();
    mocks.getUploadQuota.mockResolvedValue(null);
    mocks.toastError.mockReset();
  });

  afterEach(() => {
    vi.mocked(useActiveAccount).mockImplementation(
      () => ({ activeUser: { username: "alice" }, username: "alice" }) as unknown as ReturnType<typeof useActiveAccount>
    );
    cleanupModalContainers();
  });

  it("a refusal for one account is not shown after switching to another", async () => {
    mocks.uploadVideo.mockRejectedValue(new ThreeSpeakUploadLimitError(refusal()));
    const { rerender } = renderDialog();
    pickFile();
    await screen.findByRole("alert");

    vi.mocked(useActiveAccount).mockImplementation(
      () => ({ activeUser: { username: "bob" }, username: "bob" }) as unknown as ReturnType<typeof useActiveAccount>
    );
    rerender(<VideoUpload show={true} setShow={vi.fn()} onVideoUploaded={vi.fn()} />);

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("revokes the preview when the dialog unmounts while open", async () => {
    mocks.uploadVideo.mockImplementation(() => new Promise(() => {}));
    const { unmount } = renderDialog();
    pickFile();
    await waitFor(() => expect(mocks.uploadVideo).toHaveBeenCalledTimes(1));
    vi.mocked(URL.revokeObjectURL).mockClear();
    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });

  it("a successful upload for the old account cannot enter the new account's dialog", async () => {
    let resolveUpload: (result: { embedUrl: string; permlink: string }) => void = () => {};
    mocks.uploadVideo.mockImplementation(
      () => new Promise((resolve) => { resolveUpload = resolve; })
    );
    const onVideoUploaded = vi.fn();
    const { rerender } = renderDialog({ onVideoUploaded });
    pickFile();
    await waitFor(() => expect(mocks.uploadVideo).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "alice" })
    ));

    vi.mocked(useActiveAccount).mockImplementation(
      () => ({ activeUser: { username: "bob" }, username: "bob" }) as unknown as ReturnType<typeof useActiveAccount>
    );
    rerender(<VideoUpload show={true} setShow={vi.fn()} onVideoUploaded={onVideoUploaded} />);

    await act(async () => {
      resolveUpload({ embedUrl: "https://play.3speak.tv/embed?v=alice/abc", permlink: "abc" });
    });

    expect((screen.getByRole("button", { name: "video-upload.insert-video" }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.getElementById("video-input")).not.toBeNull();
    expect(onVideoUploaded).not.toHaveBeenCalled();
  });

  it("does not attach an old account's thumbnail to the new account's video", async () => {
    let resolveThumbnail: (result: { url: string }) => void = () => {};
    mocks.uploadThumbnailImage.mockImplementation(
      () => new Promise((resolve) => { resolveThumbnail = resolve; })
    );
    mocks.uploadVideo
      .mockResolvedValueOnce({ embedUrl: "https://play.3speak.tv/embed?v=alice/old", permlink: "old" })
      .mockResolvedValueOnce({ embedUrl: "https://play.3speak.tv/embed?v=bob/new", permlink: "new" });
    const onVideoUploaded = vi.fn();
    const { rerender } = renderDialog({ onVideoUploaded });
    pickFile();
    const thumbnailInput = await waitFor(() => {
      const input = document.querySelector('input[accept="image/*"]');
      expect(input).not.toBeNull();
      return input as HTMLInputElement;
    });
    fireEvent.change(thumbnailInput, {
      target: { files: [new File(["x"], "thumb.jpg", { type: "image/jpeg" })] }
    });
    await waitFor(() => expect(mocks.uploadThumbnailImage).toHaveBeenCalledTimes(1));

    vi.mocked(useActiveAccount).mockImplementation(
      () => ({ activeUser: { username: "bob" }, username: "bob" }) as unknown as ReturnType<typeof useActiveAccount>
    );
    rerender(<VideoUpload show={true} setShow={vi.fn()} onVideoUploaded={onVideoUploaded} />);
    await act(async () => resolveThumbnail({ url: "https://images.ecency.com/alice-thumb.jpg" }));
    pickFile();
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "video-upload.insert-video" }) as HTMLButtonElement).disabled).toBe(false)
    );
    fireEvent.click(screen.getByRole("button", { name: "video-upload.insert-video" }));

    expect(onVideoUploaded).toHaveBeenCalledWith("https://play.3speak.tv/embed?v=bob/new", undefined);
  });

  it("an upload refused after the dialog was closed and reopened leaves the new session alone", async () => {
    let rejectUpload: (e: unknown) => void = () => {};
    mocks.uploadVideo.mockImplementation(
      () => new Promise((_resolve, reject) => { rejectUpload = reject; })
    );
    const { rerender } = renderDialog();
    pickFile();
    await waitFor(() => expect(mocks.uploadVideo).toHaveBeenCalledTimes(1));

    rerender(<VideoUpload show={false} setShow={vi.fn()} onVideoUploaded={vi.fn()} />);
    rerender(<VideoUpload show={true} setShow={vi.fn()} onVideoUploaded={vi.fn()} />);
    rejectUpload(new ThreeSpeakUploadLimitError(refusal()));

    // Give the rejection a chance to land, then check it did nothing.
    await new Promise((r) => setTimeout(r, 0));
    await waitFor(() => expect(mocks.getUploadQuota).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.getElementById("video-input")).not.toBeNull();
  });
});

describe("getUploadLimitText", () => {
  it("says the limit is reached even when no next upload time is known", () => {
    const text = getUploadLimitText(refusal({ nextAt: null }));
    expect(text).toContain("video-upload.limit-reached");
    expect(text).toContain("video-upload.limit-video:1");
    expect(text).not.toContain("video-upload.limit-next");
  });

  it("builds translated text from the refusal's fields", () => {
    const text = getUploadLimitText(refusal({ kind: "short", limit: 3 }));
    expect(text).toContain("video-upload.limit-short:3");
    expect(text).toContain("video-upload.limit-next:");
  });

  it("falls back to 3Speak's message when the fields are missing", () => {
    expect(getUploadLimitText(refusal({ kind: null, limit: null }))).toBe(
      "Free accounts can upload 1 video per 24 hours."
    );
  });

  it("falls back to a generic line with no message either", () => {
    expect(getUploadLimitText(refusal({ kind: null, limit: null, message: null, nextAt: null }))).toBe(
      "video-upload.limit-reached"
    );
  });
});

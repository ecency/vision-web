import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
const saveToDraft = vi.hoisted(() => vi.fn());
const uploadTracker = vi.hoisted(() => ({
  current: null as null | { hasPendingUploads: boolean; waitForUploads: () => Promise<unknown> }
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push })
}));

vi.mock("@/app/publish/_api", () => ({
  useSaveDraftApi: () => ({ mutateAsync: saveToDraft, isPending: false })
}));

vi.mock("@/app/publish/_hooks/use-upload-tracker", () => ({
  useOptionalUploadTracker: () => uploadTracker.current
}));

const { useOpenAutosavedDraft } = await import("@/app/publish/_hooks/use-open-autosaved-draft");

describe("useOpenAutosavedDraft", () => {
  beforeEach(() => {
    push.mockReset();
    saveToDraft.mockReset();
    saveToDraft.mockResolvedValue(undefined);
    uploadTracker.current = null;
  });

  // The draft route clears publish state and refills it from the server copy,
  // which autosave may have written up to a minute ago. Navigating without
  // flushing would replace everything typed since with that older copy.
  it("flushes the newest content before navigating", async () => {
    const { result } = renderHook(() => useOpenAutosavedDraft("abc123"));

    await act(async () => {
      await result.current.openDraft();
    });

    expect(saveToDraft).toHaveBeenCalledWith({ showToast: false, redirect: false });
    expect(push).toHaveBeenCalledWith("/publish/drafts/abc123");
    expect(saveToDraft.mock.invocationCallOrder[0]).toBeLessThan(push.mock.invocationCallOrder[0]);
  });

  it("waits for in-flight image uploads before flushing", async () => {
    const order: string[] = [];
    uploadTracker.current = {
      hasPendingUploads: true,
      waitForUploads: vi.fn(async () => {
        order.push("uploads");
      })
    };
    saveToDraft.mockImplementation(async () => {
      order.push("save");
    });

    const { result } = renderHook(() => useOpenAutosavedDraft("abc123"));

    await act(async () => {
      await result.current.openDraft();
    });

    expect(order).toEqual(["uploads", "save"]);
    expect(push).toHaveBeenCalled();
  });

  // Staying put is the safe outcome: the newest content is still in memory on
  // the composer, whereas the draft route would show the stale server copy.
  it("stays put when the flush fails", async () => {
    saveToDraft.mockRejectedValue(new Error("drafts-add 406"));

    const { result } = renderHook(() => useOpenAutosavedDraft("abc123"));

    await act(async () => {
      await result.current.openDraft();
    });

    expect(push).not.toHaveBeenCalled();
  });

  it("does nothing before autosave has created a draft", async () => {
    const { result } = renderHook(() => useOpenAutosavedDraft(undefined));

    await act(async () => {
      await result.current.openDraft();
    });

    expect(saveToDraft).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

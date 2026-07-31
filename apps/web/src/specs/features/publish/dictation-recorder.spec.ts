import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useDictationRecorder } from "@/app/publish/_hooks/use-dictation-recorder";

class FakeTrack {
  stopped = false;
  stop() {
    this.stopped = true;
  }
}

let tracks: FakeTrack[] = [];
let recorders: FakeRecorder[] = [];

class FakeRecorder {
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  stream = { getTracks: () => tracks };

  constructor() {
    recorders.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["x"]) });
    this.onstop?.();
  }
}

/**
 * The two failure modes here are both invisible in a happy-path click-through: a
 * recording that never stops itself runs past the server's cap and is rejected only
 * after the user has waited for the upload, and a stream that is not released leaves
 * the browser's recording indicator lit, which reads as still being listened to.
 */
describe("useDictationRecorder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    tracks = [new FakeTrack(), new FakeTrack()];
    recorders = [];
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => tracks })) }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("stops itself at the cap instead of letting the server reject it", async () => {
    const { result } = renderHook(() => useDictationRecorder({ maxSeconds: 2 }));

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe("recording");

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    // Asserted directly rather than via waitFor: waitFor polls on real timers, which
    // never advance under useFakeTimers, so it would just hang. The interval callback
    // has already run inside the act() above.
    expect(result.current.state).toBe("stopped");
    expect(result.current.result).not.toBeNull();
  });

  test("releases every track when recording ends", async () => {
    const { result } = renderHook(() => useDictationRecorder({ maxSeconds: 60 }));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      result.current.stop();
    });

    // Dropping the reference alone leaves the microphone indicator on.
    expect(tracks.every((t) => t.stopped)).toBe(true);
  });

  test("releases the stream on unmount", async () => {
    const { result, unmount } = renderHook(() => useDictationRecorder({ maxSeconds: 60 }));

    await act(async () => {
      await result.current.start();
    });
    unmount();

    // Navigating away mid-recording would otherwise leave the mic open with no UI
    // left to stop it.
    expect(tracks.every((t) => t.stopped)).toBe(true);
  });

  test("a denied permission is a state, not a throw", async () => {
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn(async () => Promise.reject(new Error("denied"))) }
    });
    const { result } = renderHook(() => useDictationRecorder({ maxSeconds: 60 }));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe("denied");
  });
});

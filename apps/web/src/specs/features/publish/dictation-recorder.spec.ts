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

  test("stops BEFORE the cap, not at it", async () => {
    const { result } = renderHook(() => useDictationRecorder({ maxSeconds: 10 }));

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe("recording");

    // Still going at 8s.
    await act(async () => {
      vi.advanceTimersByTime(8000);
    });
    expect(result.current.state).toBe("recording");

    // Stopped by 9s. Stopping exactly AT the cap means the real duration has already
    // drifted past it by the time the recorder flushes, and the server rejects the
    // upload the user just waited through.
    await act(async () => {
      vi.advanceTimersByTime(1500);
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

  test("rounds elapsed seconds UP so the quote is never under the charge", async () => {
    const { result } = renderHook(() => useDictationRecorder({ maxSeconds: 600 }));

    await act(async () => {
      await result.current.start();
    });

    // 30.1s is two billing units on the server. The quote the user acts on is the one
    // shown once recording stops, so that is what must round up -- the 250ms ticker
    // alone would still be showing 30 at this point.
    await act(async () => {
      vi.advanceTimersByTime(30_100);
    });
    await act(async () => {
      result.current.stop();
    });

    expect(result.current.seconds).toBe(31);
  });

  test("a permission grant that lands after closing does not open the microphone", async () => {
    let release: (v: unknown) => void = () => {};
    const pending = new Promise((r) => {
      release = r;
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        mediaDevicesPlaceholder: true,
        getUserMedia: vi.fn(async () => {
          await pending;
          return { getTracks: () => tracks };
        })
      }
    });

    const { result } = renderHook(() => useDictationRecorder({ maxSeconds: 60 }));

    let starting: Promise<void>;
    act(() => {
      starting = result.current.start();
    });

    // User closes the dialog while the browser prompt is still open.
    act(() => {
      result.current.reset();
    });

    await act(async () => {
      release(undefined);
      await starting!;
    });

    // Nothing was recorded, and the stream the prompt handed back was hung up --
    // otherwise the mic stays live with no UI left able to stop it.
    expect(recorders).toHaveLength(0);
    expect(tracks.every((t) => t.stopped)).toBe(true);
  });
});

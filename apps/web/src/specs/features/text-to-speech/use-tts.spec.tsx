import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

// A privacy shim replaces `SpeechSynthesisUtterance` with a plain object, so
// the instance is not an EventTarget (ECENCY-NEXT-1GNS fired on Chrome 138,
// not an old browser). The mock lets each case hand the hook whichever
// utterance shape it wants.
const createUtteranceMock = vi.fn();
vi.mock("@/utils", () => ({
  createUtterance: (text: string) => createUtteranceMock(text),
  getVoicesAsync: vi.fn(() => new Promise(() => {})),
  useSynchronizedLocalStorage: vi.fn(() => [undefined, vi.fn()])
}));

import { useTts } from "@/features/text-to-speech/use-tts";

describe("useTts", () => {
  beforeEach(() => {
    createUtteranceMock.mockReset();
  });

  it("registers listeners via addEventListener when the utterance is an EventTarget", () => {
    const addEventListener = vi.fn();
    createUtteranceMock.mockReturnValue({ addEventListener });

    renderHook(() => useTts("hello"));

    expect(addEventListener.mock.calls.map(([event]) => event)).toEqual([
      "start",
      "end",
      "pause",
      "resume"
    ]);
  });

  it("falls back to on* handlers on a shimmed utterance without crashing", () => {
    const shim: Record<string, unknown> = {};
    createUtteranceMock.mockReturnValue(shim);

    const { result } = renderHook(() => useTts("hello"));

    // The fallback wires the legacy handler properties, and they drive the
    // same state the listeners would.
    expect(typeof shim.onstart).toBe("function");
    expect(typeof shim.onend).toBe("function");
    expect(typeof shim.onpause).toBe("function");
    expect(typeof shim.onresume).toBe("function");

    act(() => (shim.onstart as () => void)());
    expect(result.current.hasStarted).toBe(true);
    act(() => (shim.onpause as () => void)());
    expect(result.current.hasPaused).toBe(true);
  });

  it("survives cleanup when the speechSynthesis global is absent", () => {
    // jsdom has no `speechSynthesis`, matching the shim environments where the
    // constructor exists but the manager global does not — a bare-identifier
    // `speechSynthesis.cancel()` in the effect cleanup is a ReferenceError here.
    expect("speechSynthesis" in window).toBe(false);
    createUtteranceMock.mockReturnValue({ addEventListener: vi.fn() });

    const { unmount } = renderHook(() => useTts("hello"));
    expect(() => unmount()).not.toThrow();
  });
});

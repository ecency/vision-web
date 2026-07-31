import { describe, expect, test, vi } from "vitest";
import { runDictationSubmit } from "@/app/publish/_hooks/run-dictation-submit";

/**
 * Exercises the real helper the dialog calls. An earlier version of this spec
 * restated the ordering locally, which meant the production path could regress
 * while the test stayed green -- the ordering IS the behaviour here, so a copy
 * tests nothing.
 *
 * A charge lands the moment `transcribe` is called, so the closure check has to sit
 * between the token refresh and the request, not after it.
 */
describe("runDictationSubmit", () => {
  test("closing during the token refresh sends nothing", async () => {
    let closed = false;
    const transcribe = vi.fn(async () => ({ text: "hello" }) as any);

    const outcome = await runDictationSubmit({
      // Stands in for the user dismissing while the refresh is still in flight.
      ensureToken: async () => {
        closed = true;
        return "fresh-token";
      },
      transcribe,
      isClosed: () => closed
    });

    expect(outcome).toEqual({ status: "abandoned" });
    // The charge never happened: the check precedes the request.
    expect(transcribe).not.toHaveBeenCalled();
  });

  test("closing during transcription discards the result", async () => {
    let closed = false;

    const outcome = await runDictationSubmit({
      ensureToken: async () => "fresh-token",
      // Stands in for unmount by navigation, which dismissal-blocking cannot stop.
      transcribe: async () => {
        closed = true;
        return { text: "hello" } as any;
      },
      isClosed: () => closed
    });

    expect(outcome).toEqual({ status: "abandoned" });
  });

  test("a failed refresh stops before charging", async () => {
    const transcribe = vi.fn(async () => ({ text: "hello" }) as any);

    const outcome = await runDictationSubmit({
      ensureToken: async () => null,
      transcribe,
      isClosed: () => false
    });

    expect(outcome).toEqual({ status: "no-token" });
    expect(transcribe).not.toHaveBeenCalled();
  });

  test("the happy path returns the transcript and uses the refreshed token", async () => {
    const transcribe = vi.fn(async () => ({ text: "hello world" }) as any);

    const outcome = await runDictationSubmit({
      ensureToken: async () => "fresh-token",
      transcribe,
      isClosed: () => false
    });

    expect(transcribe).toHaveBeenCalledWith({ code: "fresh-token" });
    expect(outcome).toEqual({ status: "transcribed", response: { text: "hello world" } });
  });

  test("errors from the request propagate for the caller to map", async () => {
    // Status-to-message mapping is the dialog's job, so this must not swallow.
    await expect(
      runDictationSubmit({
        ensureToken: async () => "fresh-token",
        transcribe: async () => {
          throw Object.assign(new Error("nope"), { status: 402 });
        },
        isClosed: () => false
      })
    ).rejects.toMatchObject({ status: 402 });
  });
});

import { describe, expect, test, vi } from "vitest";

/**
 * The dictation submit is a two-step operation: refresh the token, then send the
 * paid request. Only the second step is covered by the mutation's own pending flag,
 * which left a window where the dialog was closable but the charge still went out.
 *
 * This models that sequence directly rather than mounting the dialog, because the
 * property under test is the ordering of the closure check against the awaits, and
 * a rendered test would not distinguish "checked before the request" from "checked
 * after it".
 */

interface SubmitDeps {
  ensureValidToken: () => Promise<string | null>;
  transcribe: (args: { code: string }) => Promise<{ text: string }>;
  onInsert: (text: string) => void;
  isClosed: () => boolean;
}

/** Mirrors the guard ordering in publish-editor-dictation-dialog's submit(). */
async function submit({ ensureValidToken, transcribe, onInsert, isClosed }: SubmitDeps) {
  const token = await ensureValidToken();
  if (isClosed()) return;
  if (!token) return;

  const response = await transcribe({ code: token });
  if (isClosed()) return;

  onInsert(response.text);
}

describe("dictation submit guards", () => {
  test("closing during the token refresh does not send the paid request", async () => {
    let closed = false;
    const transcribe = vi.fn(async () => ({ text: "hello" }));
    const onInsert = vi.fn();

    await submit({
      // The user closes the dialog while the refresh is still in flight.
      ensureValidToken: async () => {
        closed = true;
        return "fresh-token";
      },
      transcribe,
      onInsert,
      isClosed: () => closed
    });

    // Nothing was charged: the check sits before transcribe(), not after it.
    expect(transcribe).not.toHaveBeenCalled();
    expect(onInsert).not.toHaveBeenCalled();
  });

  test("closing during transcription does not touch the draft", async () => {
    let closed = false;
    const onInsert = vi.fn();

    await submit({
      ensureValidToken: async () => "fresh-token",
      transcribe: async () => {
        // Stands in for unmount by navigation, which dismissal-blocking cannot stop.
        closed = true;
        return { text: "hello" };
      },
      onInsert,
      isClosed: () => closed
    });

    expect(onInsert).not.toHaveBeenCalled();
  });

  test("the happy path still inserts, using the refreshed token", async () => {
    const transcribe = vi.fn(async () => ({ text: "hello world" }));
    const onInsert = vi.fn();

    await submit({
      ensureValidToken: async () => "fresh-token",
      transcribe,
      onInsert,
      isClosed: () => false
    });

    expect(transcribe).toHaveBeenCalledWith({ code: "fresh-token" });
    expect(onInsert).toHaveBeenCalledWith("hello world");
  });

  test("a failed refresh stops before charging", async () => {
    const transcribe = vi.fn(async () => ({ text: "hello" }));

    await submit({
      ensureValidToken: async () => null,
      transcribe,
      onInsert: vi.fn(),
      isClosed: () => false
    });

    expect(transcribe).not.toHaveBeenCalled();
  });
});

import type { AiTranscribeResponse } from "@ecency/sdk";

export type DictationSubmitOutcome =
  /** The dialog was closed mid-flight. Nothing was sent, or the result is discarded. */
  | { status: "abandoned" }
  /** The session could not be refreshed, so nothing was sent. */
  | { status: "no-token" }
  | { status: "transcribed"; response: AiTranscribeResponse };

interface RunDictationSubmitDeps {
  // Widened: ensureValidToken resolves undefined on failure, other callers use null.
  ensureToken: () => Promise<string | null | undefined>;
  transcribe: (args: { code: string }) => Promise<AiTranscribeResponse>;
  isClosed: () => boolean;
}

/**
 * The ordering of the closure checks around the two awaits in a dictation submit.
 *
 * This lives on its own rather than inline in the dialog because the ordering *is*
 * the behaviour: the check has to sit between the token refresh and the request, not
 * after it. A charge lands the moment `transcribe` is called, so sending after the
 * user has closed the dialog pays for a transcript with nowhere to put it.
 *
 * Errors from `transcribe` propagate; mapping them to messages is the caller's job.
 */
export async function runDictationSubmit({
  ensureToken,
  transcribe,
  isClosed
}: RunDictationSubmitDeps): Promise<DictationSubmitOutcome> {
  const token = await ensureToken();

  // Before the request, not after. Dismissal is blocked for the duration of the
  // submit, but an unmount (navigation) is not.
  if (isClosed()) {
    return { status: "abandoned" };
  }

  if (!token) {
    return { status: "no-token" };
  }

  const response = await transcribe({ code: token });

  if (isClosed()) {
    return { status: "abandoned" };
  }

  return { status: "transcribed", response };
}

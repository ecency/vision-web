import { useCallback, useEffect, useRef, useState } from "react";

export type DictationRecorderState = "idle" | "requesting" | "recording" | "stopped" | "denied";

interface UseDictationRecorderOptions {
  /** Hard stop at the server's cap so a forgotten recording cannot become unbillable. */
  maxSeconds: number;
}

/**
 * MediaRecorder wrapper for dictation.
 *
 * Duration is measured from wall-clock time rather than read back off the blob:
 * Chrome's WebM output frequently carries no duration in its header, so anything
 * that decodes the file gets Infinity. The server treats this value as a hint and
 * bills on what the vendor reports, so a small drift costs nothing.
 */
export function useDictationRecorder({ maxSeconds }: UseDictationRecorderOptions) {
  const [state, setState] = useState<DictationRecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<{ blob: Blob; durationMs: number } | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Bumped by every reset/unmount. start() captures the value it began with, so a
  // permission prompt that resolves after the dialog closed can tell that it is
  // stale and hang up instead of opening a microphone nothing can close.
  const generationRef = useRef(0);

  const releaseStream = useCallback(() => {
    generationRef.current += 1;
    // Stop every track explicitly. Dropping the reference alone leaves the browser's
    // recording indicator lit, which reads to the user as still being listened to.
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  const start = useCallback(async () => {
    setResult(null);
    setSeconds(0);
    setState("requesting");

    const generation = generationRef.current;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (generation !== generationRef.current) {
        // A rejection from a prompt that has already been superseded. Reporting it
        // would overwrite the state of the recording that replaced it -- leaving a
        // live microphone behind a "denied" screen with no stop button on it.
        return;
      }
      // Denied, dismissed, or no input device. All three leave the user unable to
      // dictate, and the browser has already explained why, so they collapse here.
      setState("denied");
      return;
    }

    if (generation !== generationRef.current) {
      // The dialog was closed or unmounted while the permission prompt was open.
      // releaseStream ran before recorderRef existed, so nothing here is tracked --
      // starting now would open a microphone with no UI left able to close it.
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const durationMs = Date.now() - startedAtRef.current;
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      releaseStream();
      // Re-derive the displayed length from the real duration. The ticker only runs
      // every 250ms, so the last tick can sit up to a quarter second behind -- enough
      // for a clip that just crossed a billing boundary to still read as the cheaper
      // one on the screen the user is looking at when they press Insert.
      setSeconds(Math.ceil(durationMs / 1000));
      setResult({ blob, durationMs });
      setState("stopped");
    };

    startedAtRef.current = Date.now();
    recorder.start();
    setState("recording");

    tickRef.current = setInterval(() => {
      const elapsedMs = Date.now() - startedAtRef.current;
      // Round UP. The quote is derived from this, and the server bills whole units
      // off the real millisecond duration -- so flooring makes a 30.1s clip read as
      // one unit on screen while being charged for two.
      setSeconds(Math.ceil(elapsedMs / 1000));
      // Stop a tick early. Stopping exactly AT the cap means the real duration has
      // already drifted past it by the time the recorder flushes, and the server
      // rejects the upload the user has just waited through.
      if (elapsedMs >= (maxSeconds - 1) * 1000) {
        stop();
      }
    }, 250);
  }, [maxSeconds, releaseStream, stop]);

  const reset = useCallback(() => {
    releaseStream();
    chunksRef.current = [];
    setResult(null);
    setSeconds(0);
    setState("idle");
  }, [releaseStream]);

  // Releasing on unmount matters more than usual here: navigating away mid-recording
  // would otherwise leave the microphone open with no UI left to stop it.
  useEffect(() => releaseStream, [releaseStream]);

  return { state, seconds, result, start, stop, reset };
}

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

  const releaseStream = useCallback(() => {
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

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Denied, dismissed, or no input device. All three leave the user unable to
      // dictate, and the browser has already explained why, so they collapse here.
      setState("denied");
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
      setResult({ blob, durationMs });
      setState("stopped");
    };

    startedAtRef.current = Date.now();
    recorder.start();
    setState("recording");

    tickRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= maxSeconds) {
        // Stop ourselves at the cap rather than letting the server reject the upload
        // after the user has already waited for it.
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

import {createUtterance, getVoicesAsync, useSynchronizedLocalStorage} from "@/utils";
import { PREFIX } from "@/utils/local-storage";
import { useEffect, useRef, useState } from "react";

export function useTts(text: string) {
  const speechRef = useRef<SpeechSynthesisUtterance | undefined>(undefined);

  const [hasStarted, setHasStarted] = useState(false);
  const [hasPaused, setHasPaused] = useState(false);

  const [voice] = useSynchronizedLocalStorage<string>(PREFIX + "_tts_voice");

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (speechRef.current) {
      speechRef.current = undefined;
      setHasPaused(false);
      setHasStarted(false);
    }

    const utterance = createUtterance(text);
    if (!utterance) return;
    speechRef.current = utterance;

    getVoicesAsync().then((voices) => {
      const foundVoice = voices.find((vc) => vc.voiceURI === voice);
      if (foundVoice) {
        utterance.voice = foundVoice;
      }
    });

    // The failing field environment is NOT an old browser: ECENCY-NEXT-1GNS
    // fired on Chrome 138, where the real constructor is always an EventTarget.
    // Privacy shims replace `SpeechSynthesisUtterance` with a plain object to
    // block voice fingerprinting (same family as the iOS Brave `getVoices`
    // shim, ECENCY-NEXT-1GMR), so nothing about the instance can be assumed.
    if (typeof utterance.addEventListener === "function") {
      utterance.addEventListener("start", () => setHasStarted(true));
      utterance.addEventListener("end", () => setHasStarted(false));
      utterance.addEventListener("pause", () => setHasPaused(true));
      utterance.addEventListener("resume", () => setHasPaused(false));
    } else {
      utterance.onstart = () => setHasStarted(true);
      utterance.onend = () => setHasStarted(false);
      utterance.onpause = () => setHasPaused(true);
      utterance.onresume = () => setHasPaused(false);
    }

    return () => {
      // Same hostile environments: `createUtterance` only proves the
      // constructor exists, not the manager global, and the bare identifier
      // is a ReferenceError where `speechSynthesis` is absent entirely.
      window.speechSynthesis?.cancel?.();
      speechRef.current = undefined;
    };
  }, [text, voice]);

  return {
    hasPaused,
    hasStarted,
    speechRef,
    voice
  };
}

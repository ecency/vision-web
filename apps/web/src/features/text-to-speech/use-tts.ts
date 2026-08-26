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
      speechSynthesis.cancel();
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

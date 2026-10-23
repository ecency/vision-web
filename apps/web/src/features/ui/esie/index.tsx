"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { ESIE_MOODS, type EsieMood } from "./esie-moods.generated";

export type { EsieMood };

/**
 * Where Esie appears, with the same mood and height as the native apps (`EsiePlacement` there),
 * so empty lists, errors, success moments and greetings look alike on web and mobile.
 */
export const ESIE_PLACEMENTS = {
  empty: { mood: "rest", height: 120 },
  error: { mood: "sad", height: 120 },
  success: { mood: "happy", height: 96 },
  welcome: { mood: "wave", height: 160 },
  thinking: { mood: "thinking", height: 96 }
} as const satisfies Record<string, { mood: EsieMood; height: number }>;

export type EsiePlacement = keyof typeof ESIE_PLACEMENTS;

/** The image URL of a mood, for a `<link rel="preload">` that must match what `Esie` renders. */
export function esieSrc(mood: EsieMood): string {
  return ESIE_MOODS[mood].src;
}

// Browsers run one animation clock per image URL, started when it first loads. So a mood shown again
// later in the page would open mid-way (a greeting already done waving, a settled thinking pose).
// Moods already mounted once get their own URL, and with it a fresh start. Only effects fill this,
// so server renders and hydration always use the plain URL.
const mounted = new Set<EsieMood>();
let instance = 0;

interface Props {
  /** A named placement (sets mood and height), or pass `mood` and `height` directly. */
  placement?: EsiePlacement;
  mood?: EsieMood;
  height?: number;
  className?: string;
  /** Read out by screen readers. Without it Esie is decorative and hidden from them. */
  label?: string;
  /** The page's main image: load eagerly at high priority. */
  priority?: boolean;
}

/**
 * Esie, the Ecency mascot. Each mood is a self-contained animated SVG under /assets/esie, built by
 * `scripts/esie/build.mjs` from the art the native apps use: no script runs in it, the motion settles
 * after about 30 s (only the blink continues), and reduced motion shows a still pose.
 */
export function Esie({ placement, mood, height, className, label, priority = false }: Props) {
  const preset = placement ? ESIE_PLACEMENTS[placement] : undefined;
  const resolvedMood: EsieMood = mood ?? preset?.mood ?? "rest";
  const resolvedHeight = height ?? preset?.height ?? 120;
  const { src, ratio } = ESIE_MOODS[resolvedMood];
  const [imageSrc] = useState(() =>
    mounted.has(resolvedMood) ? `${src}&i=${++instance}` : src
  );

  useEffect(() => {
    mounted.add(resolvedMood);
  }, [resolvedMood]);

  return (
    // a plain img: next/image adds nothing for a vector and its loader would skip the SVG anyway
    <img
      src={imageSrc.startsWith(src) ? imageSrc : src}
      width={Math.round(resolvedHeight * ratio)}
      height={resolvedHeight}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding={priority ? undefined : "async"}
      draggable={false}
      data-esie-mood={resolvedMood}
      className={clsx("esie shrink-0 select-none max-w-full h-auto", className)}
    />
  );
}

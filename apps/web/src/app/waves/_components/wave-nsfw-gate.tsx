"use client";

import React, { ReactNode } from "react";
import i18next from "i18next";
import clsx from "clsx";

interface Props {
  covered: boolean;
  onReveal: () => void;
  children: ReactNode;
}

// Everything a wave body can show that is not text: pictures, players and the
// preview cards embeds render. Blurred and made inert, so a click cannot open a
// lightbox or start a video underneath the cover.
const COVERED_MEDIA = clsx(
  "[&_img]:blur-2xl [&_img]:pointer-events-none [&_img]:select-none",
  "[&_video]:blur-2xl [&_video]:pointer-events-none",
  "[&_iframe]:blur-2xl [&_iframe]:pointer-events-none",
  "[&_picture]:overflow-hidden [&_figure]:overflow-hidden"
);

const MEDIA = "img,video,iframe,picture";

/**
 * Is this click aimed at covered media? Either the media itself, or a link that
 * wraps it: `[![](pic)](pic)` renders an <a> around the <img>, and with the image
 * made inert the click lands on that anchor, which would open the original.
 */
function hitsCoveredMedia(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest(MEDIA)) {
    return true;
  }
  const link = target.closest("a");
  return Boolean(link?.querySelector(MEDIA));
}

function swallowMediaClick(e: React.MouseEvent) {
  if (hitsCoveredMedia(e.target)) {
    e.preventDefault();
    e.stopPropagation();
  }
}

/**
 * Covers the media of a wave flagged as explicit and leaves its text readable.
 *
 * The reveal control is a real <button> placed above the content rather than an
 * overlay on top of it: the wave card opens the wave on any click that does not
 * land on an interactive element, so an overlay that missed a pixel would send
 * the viewer straight to the picture. The click also stops here for the same
 * reason.
 */
export function WaveNsfwGate({ covered, onReveal, children }: Props) {
  if (!covered) {
    return <>{children}</>;
  }

  return (
    <div data-testid="wave-nsfw-gate">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[--border-color] px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
        <span>{i18next.t("waves.nsfw-cover")}</span>
        <button
          type="button"
          className="font-semibold text-blue-dark-sky hover:underline"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onReveal();
          }}
        >
          {i18next.t("waves.nsfw-reveal")}
        </button>
      </div>
      {/* Capture phase, so it runs before the link's own navigation and before a
          lightbox or the card handler can act on a click aimed at covered media.
          Middle click and modified clicks arrive as auxclick / click alike. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className={clsx("overflow-hidden", COVERED_MEDIA)}
        data-nsfw-covered="true"
        onClickCapture={swallowMediaClick}
        onAuxClickCapture={swallowMediaClick}
      >
        {children}
      </div>
    </div>
  );
}

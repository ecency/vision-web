"use client";

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import {renderPostBody, setProxyBase} from "@ecency/render-helper";
import md5 from "js-md5";
import defaults from "@/defaults";
import "@/features/post-renderer/video-embeds.scss";
// Imported from their own files, not the post-renderer barrel: the barrel pulls
// in ecency-renderer.scss, which must not override the preview's markdown styles.
import { YoutubeVideoExtension } from "@/features/post-renderer/components/extensions/youtube-video-extension";
import { ThreeSpeakVideoExtension } from "@/features/post-renderer/components/extensions/three-speak-video-extension";
import { EmbedVideoExtension } from "@/features/post-renderer/components/extensions/embed-video-extension";

interface Props {
  rawBody: string;
  className?: string;
}

interface Line {
  element: Element;
  hash: string;
}

/**
 * One rendered block of the preview. Its key is the hash of its HTML, so its
 * DOM never changes after mount: an edit elsewhere leaves it (and a playing
 * video in it) alone, and an edit to it mounts a fresh line. That is why the
 * click-to-play extensions, which enhance only on mount, can be mounted per
 * line here rather than re-run over the whole preview on every keystroke.
 *
 * memo is load-bearing: React writes innerHTML again whenever it gets a new
 * dangerouslySetInnerHTML object, even with the same string, which would wipe
 * the extensions' markers and players (and reload every image) per keystroke.
 */
const PreviewLine = memo(function PreviewLine({
  html,
  hasVideo
}: {
  html: string;
  hasVideo: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
      {hasVideo && (
        <>
          <YoutubeVideoExtension containerRef={ref} />
          <ThreeSpeakVideoExtension containerRef={ref} />
          <EmbedVideoExtension containerRef={ref} />
        </>
      )}
    </>
  );
});

setProxyBase(defaults.imageServer);
export function PostBodyLazyRenderer({ rawBody, className }: Props) {
  const [lines, setLines] = useState<Line[]>([]);

  const lazyBuild = useCallback(() => {
    const renderedBody = renderPostBody(rawBody, false);
    const tree = document.createElement("div");
    tree.innerHTML = renderedBody;

    const nextLines: Line[] = [];

    for (let i = 0; i < tree.children.length; i++) {
      const element = tree.children.item(i)!!;

      const hash = md5(element.outerHTML + `index-${i}`);

      nextLines.push({ element, hash });
    }

    setLines(nextLines);
  }, [rawBody]);

  useEffect(() => {
    lazyBuild();
  }, [lazyBuild]);

  return (
    <div className={className}>
      {lines.map(({ element, hash }) => (
        <PreviewLine
          key={hash}
          html={element.outerHTML}
          hasVideo={
            element.matches(".markdown-video-link") ||
            element.querySelector(".markdown-video-link") !== null
          }
        />
      ))}
    </div>
  );
}

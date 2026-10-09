"use client";

import React, { useCallback, useEffect, useState } from "react";
import {renderPostBody, setProxyBase} from "@ecency/render-helper";
import md5 from "js-md5";
import defaults from "@/defaults";
import "@/features/post-renderer/video-embeds.scss";

interface Props {
  rawBody: string;
  className?: string;
}

interface Line {
  element: Element;
  hash: string;
}
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
        <div key={hash} dangerouslySetInnerHTML={{ __html: element.outerHTML }} />
      ))}
    </div>
  );
}

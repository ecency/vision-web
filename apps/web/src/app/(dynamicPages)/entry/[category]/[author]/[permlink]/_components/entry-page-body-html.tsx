"use client";

import { type CSSProperties, useEffect, useMemo } from "react";

/*
  The body viewer enhances #post-body from an effect, but the node and its
  html can change without any of the viewer's own deps changing: turning raw
  off flips isRawContent while the <pre> fallback is still mounted, and the
  refresh then mounts this body; a refresh with different html rewrites
  innerHTML. This counter moves after every such commit so the viewer
  (useSyncExternalStore) runs its enhancements again (#2083).
*/
let bodyVersion = 0;
const listeners = new Set<() => void>();

export function subscribePostBody(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPostBodyVersion(): number {
  return bodyVersion;
}

interface Props {
  html: string;
  style?: CSSProperties;
}

/**
 * The rendered post body, still server-rendered in the SSR shell: this client
 * component renders the same markup on the server. It exists to keep the
 * {__html} object stable. React writes innerHTML whenever that object changes,
 * even for the same string, and a server component hands a new one on every
 * RSC refresh (closing Edit History calls router.replace). That wiped every
 * enhancement the body viewer had applied: tweets, videos, hive ops (#2083).
 */
export function EntryPageBodyHtml({ html, style }: Props) {
  const innerHtml = useMemo(() => ({ __html: html }), [html]);
  // Runs after the commit that mounted the node or rewrote its innerHTML.
  useEffect(() => {
    bodyVersion += 1;
    listeners.forEach((listener) => listener());
  }, [innerHtml]);
  return (
    <div
      id="post-body"
      className="entry-body markdown-view user-selectable client er-youtube-source-host"
      style={style}
      dangerouslySetInnerHTML={innerHtml}
    />
  );
}

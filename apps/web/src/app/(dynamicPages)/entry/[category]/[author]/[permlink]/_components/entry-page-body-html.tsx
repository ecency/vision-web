"use client";

import { type CSSProperties, useMemo } from "react";

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
  return (
    <div
      id="post-body"
      className="entry-body markdown-view user-selectable client"
      style={style}
      dangerouslySetInnerHTML={innerHtml}
    />
  );
}

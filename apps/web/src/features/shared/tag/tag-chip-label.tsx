"use client";

import { getCommunityCache } from "@/core/caches";
import { isCommunity } from "@/utils";
import { useQuery } from "@tanstack/react-query";

interface Props {
  tag: string;
  /** The title when the caller already has it, so no lookup runs. */
  title?: string | null;
}

/**
 * What a tag chip says. A community id (`hive-125125`) reads as the community's
 * title, the way the header names it; anything else reads as the tag itself.
 * The title comes from the same cache entry the community pages use, so a chip
 * for the post's own community costs no request.
 */
export function TagChipLabel({ tag, title }: Props) {
  const { data: community } = useQuery({
    ...getCommunityCache(tag),
    enabled: !title && isCommunity(tag)
  });

  return <span className="notranslate">{title || community?.title || tag}</span>;
}

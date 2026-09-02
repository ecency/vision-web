"use client";

import { FollowTagBtn } from "@/features/shared/follow-tag-btn";
import { normalizeTag } from "@ecency/sdk";
import i18next from "i18next";

interface Props {
  tag: string;
}

/**
 * The header of a plain tag's feed: the tag's name and a Follow button. A
 * community feed has its own card, and a value the follow rule refuses (an
 * underscore tag, say) gets no header rather than a button that cannot work.
 */
export function TagFeedHeader({ tag }: Props) {
  if (!normalizeTag(tag)) {
    return null;
  }

  return (
    <div className="tag-feed-header mb-3 flex items-center justify-between gap-3 rounded-2xl border border-[--border-color] bg-white px-4 py-3 dark:bg-dark-default">
      <div className="flex min-w-0 flex-col">
        <h1 className="notranslate truncate text-lg font-semibold">#{tag}</h1>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {i18next.t("follow-tag.header-hint")}
        </span>
      </div>
      <FollowTagBtn tag={tag} />
    </div>
  );
}

"use client";

import { FollowTagBtn } from "@/features/shared/follow-tag-btn";
import { DigestSubscribeButton } from "@/features/newsletter";
import { NewsletterGate } from "@/features/newsletter/runtime";
import { normalizeTag } from "@ecency/sdk";
import i18next from "i18next";

interface Props {
  tag: string;
  /**
   * Whether the feed behind this header has posts. The email digest is offered
   * only then: the service refuses a tag nobody posts under anyway, and a button
   * that can only fail is worse than none.
   */
  hasPosts?: boolean;
}

/**
 * The header of a plain tag's feed: the tag's name, a Follow button, and the
 * tag's email digest. A community feed has its own card, and a value the follow
 * rule refuses (an underscore tag, say) gets no header rather than a button
 * that cannot work.
 */
export function TagFeedHeader({ tag, hasPosts = true }: Props) {
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
      <div className="flex shrink-0 items-center gap-2">
        {hasPosts && (
          <NewsletterGate>
            <DigestSubscribeButton
              type="tag"
              target={tag}
              targetLabel={`#${tag}`}
              source="tag-page"
              size="sm"
              label={i18next.t("newsletter.button-tag", { name: tag })}
            />
          </NewsletterGate>
        )}
        <FollowTagBtn tag={tag} />
      </div>
    </div>
  );
}

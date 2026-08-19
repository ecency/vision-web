import { Entry } from "@/entities";
import { PollWidget, useEntryPollExtractor } from "@/features/polls";
import { useEntryLocation } from "@/utils";
import { UilMapPinAlt } from "@tooni/iconscout-unicons-react";
import Link from "next/link";
import { NewsletterGate } from "@/features/newsletter/runtime";
import { PostSubscribePrompt } from "@/features/newsletter/post-subscribe-prompt";
import { EntryFooterControls } from "./entry-footer-controls";
import { EntryFooterInfo } from "./entry-footer-info";
import { EntryPageIsCommentHeader } from "./entry-page-is-comment-header";
import { EntryPageMainInfo } from "./entry-page-main-info";
import { EntryPageStaticBody } from "./entry-page-static-body";
import { EntryPageWarnings } from "./entry-page-warnings";
import { EntryTags } from "./entry-tags";
import { EntryPageNsfwBodyWrapper } from "./entry-page-nsfw-body-wrapper";
import { EntryTranslateInline } from "@/features/shared/entry-translate/entry-translate-inline";

interface Props {
  entry: Entry;
  isRawContent?: boolean;
}

export function EntryPageContentSSR({ entry, isRawContent }: Props) {
  const location = useEntryLocation(entry);
  const postPoll = useEntryPollExtractor(entry);
  return (
    <>
      <div className="entry-header">
        <EntryPageWarnings entry={entry} />
        <EntryPageIsCommentHeader entry={entry} />
        <EntryPageMainInfo entry={entry} />
      </div>
      {/* SSR static body - wrapped with NSFW check */}
      <EntryPageNsfwBodyWrapper entry={entry}>
        {!isRawContent && (
          <div className="bg-white/80 dark:bg-dark-200/90 rounded-xl p-2 md:p-4">
            <EntryTranslateInline entry={entry} />
            <EntryPageStaticBody entry={entry} />
            {postPoll && <PollWidget entry={entry} poll={postPoll} isReadOnly={false} />}
          </div>
        )}
        {isRawContent && (
          <pre
            id="post-body"
            className="entry-body markdown-view user-selectable font-mono bg-gray-100 rounded text-sm !p-4 dark:bg-gray-900 whitespace-pre-wrap break-words"
          >
            {entry.body}
          </pre>
        )}
      </EntryPageNsfwBodyWrapper>
      <div className="entry-footer bg-white/80 dark:bg-dark-200/90 rounded-xl flex-wrap my-4 lg:mb-8">
        {location?.coordinates && (
          <Link
            href={`https://maps.google.com/?q=${location.coordinates.lat},${location.coordinates.lng}`}
            target="_external"
            rel="nofollow noopener"
            className="text-sm block border-b border-[--border-color] p-2 md:p-3"
          >
            <UilMapPinAlt className="size-4 mr-1" />
            {location.address}
          </Link>
        )}
        <div className="border-b border-[--border-color] p-2 md:p-3">
          <EntryTags entry={entry} />
          <EntryFooterInfo entry={entry} />
        </div>
        <EntryFooterControls entry={entry} />
        <NewsletterGate>
          <PostSubscribePrompt entry={entry} className="m-2 md:m-3" />
        </NewsletterGate>
      </div>
    </>
  );
}

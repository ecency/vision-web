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
import { EntryPageRawBody } from "./entry-page-raw-body";
import { EntryPageStaticBody } from "./entry-page-static-body";
import { EntryPageWarnings } from "./entry-page-warnings";
import { EntryTags } from "./entry-tags";
import { EntryPageNsfwBodyWrapper } from "./entry-page-nsfw-body-wrapper";
import { EntryTranslateInline } from "@/features/shared/entry-translate/entry-translate-inline";
import { ListenPlayer } from "@/features/listen";

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
      </div>
      {/* The article is ONE surface, masthead to colophon: title, byline, meta
          strip, body, then tags, source and the vote/payout row. It is a single
          object, so every break inside it is a hairline (see the meta strip's
          border-y in entry-page-main-info), never a card gap, and the headline
          is not split from the first paragraph. Separate cards are for what is
          NOT the post: the newsletter ask, related posts and comments. */}
      <div className="entry-article reading-surface border border-[--border-color] rounded-xl mt-2 lg:mt-4 mb-4 md:mb-6 lg:mb-8">
        <EntryPageMainInfo entry={entry} />
        {/* SSR static body - wrapped with NSFW check */}
        <EntryPageNsfwBodyWrapper entry={entry}>
          {!isRawContent && (
            <div className="px-3 md:px-4 py-3 md:py-4">
              <ListenPlayer entry={entry} />
              <EntryTranslateInline entry={entry} />
              <EntryPageStaticBody entry={entry} />
              {postPoll && <PollWidget entry={entry} poll={postPoll} isReadOnly={false} />}
            </div>
          )}
          {isRawContent && <EntryPageRawBody entry={entry} className="m-3 md:m-4" />}
        </EntryPageNsfwBodyWrapper>
        {/* Colophon: tags, source and the vote/payout row close the article the
            way the masthead opens it, so they sit on its surface with hairlines
            between them. `entry-footer` stays as the class: entry.scss scopes
            .entry-tags and .entry-controls under it. */}
        <div className="entry-footer border-t border-[--border-color] flex-wrap">
          {location?.coordinates && (
            <Link
              href={`https://maps.google.com/?q=${location.coordinates.lat},${location.coordinates.lng}`}
              target="_external"
              rel="nofollow noopener"
              className="text-sm block border-b border-[--border-color] px-3 md:px-4 py-2 md:py-3"
            >
              <UilMapPinAlt className="size-4 mr-1" />
              {location.address}
            </Link>
          )}
          <div className="border-b border-[--border-color] px-3 md:px-4 py-2 md:py-3">
            <EntryTags entry={entry} />
            <EntryFooterInfo entry={entry} />
          </div>
          <EntryFooterControls entry={entry} />
        </div>
      </div>
      {/* Not part of the post: an ask about future posts. It was a bordered box
          nested inside the footer card; it is its own card now. */}
      <NewsletterGate>
        <PostSubscribePrompt entry={entry} className="my-4 lg:mb-8" />
      </NewsletterGate>
    </>
  );
}

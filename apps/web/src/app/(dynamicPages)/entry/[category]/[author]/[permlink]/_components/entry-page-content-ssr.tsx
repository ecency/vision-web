import { Entry } from "@/entities";
import { PollWidget, useEntryPollExtractor } from "@/features/polls";
import { useEntryLocation } from "@/utils";
import { UilMapPinAlt } from "@tooni/iconscout-unicons-react";
import Link from "next/link";
import { EntryFooterControls } from "./entry-footer-controls";
import { EntryFooterInfo } from "./entry-footer-info";
import { EntryPageIsCommentHeader } from "./entry-page-is-comment-header";
import { EntryPageMainInfo } from "./entry-page-main-info";
import { EntryPageStaticBody } from "./entry-page-static-body";
import { EntryPageWarnings } from "./entry-page-warnings";
import { EntryTags } from "./entry-tags";
import { EntryPageNsfwBodyWrapper } from "./entry-page-nsfw-body-wrapper";
import { needsNsfwGate } from "./entry-page-nsfw-gate";
import { EntryTranslateInline } from "@/features/shared/entry-translate/entry-translate-inline";

interface Props {
  entry: Entry;
  isRawContent?: boolean;
}

export function EntryPageContentSSR({ entry, isRawContent }: Props) {
  const location = useEntryLocation(entry);
  const postPoll = useEntryPollExtractor(entry);
  const body = (
    <>
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
    </>
  );
  return (
    <>
      <div className="entry-header">
        <EntryPageWarnings entry={entry} />
        <EntryPageIsCommentHeader entry={entry} />
        <EntryPageMainInfo entry={entry} />
      </div>
      {/* SSR static body. The NSFW click-to-reveal gate is a client component,
          and any server subtree passed through it as children has its element
          props serialized into the RSC payload — including the rendered
          article in EntryPageStaticBody's dangerouslySetInnerHTML (~11 KB that
          nothing on the client reads; the viewer only enhances the SSR-painted
          #post-body). So the gate is mounted ONLY when the post actually needs
          it. Non-NSFW posts (the vast majority) render the body directly in the
          server tree. NSFW posts keep exactly the previous behaviour. See #1538. */}
      {needsNsfwGate(entry) ? (
        <EntryPageNsfwBodyWrapper entry={entry}>{body}</EntryPageNsfwBodyWrapper>
      ) : (
        body
      )}
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
      </div>
    </>
  );
}

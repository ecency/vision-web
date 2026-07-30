'use client';

import { renderPostBody } from '@ecency/render-helper';
import type { Entry } from '@ecency/sdk';
import { useMemo } from 'react';

interface Props {
  entry: Entry;
  isRawContent?: boolean;
}

export function BlogPostBody({ entry, isRawContent }: Props) {
  const entryData = entry.original_entry || entry;

  const renderedBody = useMemo(
    // embedVideosDirectly: emit ready-to-play iframes for YouTube/3Speak instead
    // of click-to-play thumbnails. The self-hosted SPA does not run the web app's
    // client-side video enhancers, so without this videos render as inert placeholders.
    // inertAuthorAndTagChips: a blog has no profile or tag routes, so @user and
    // #tag chips render as spans instead of links to nowhere.
    () =>
      renderPostBody(entryData.body, false, false, 'ecency.com', undefined, {
        embedVideosDirectly: true,
        inertAuthorAndTagChips: true,
      }),
    [entryData.body],
  );

  if (isRawContent) {
    return (
      <div className="mb-6 sm:mb-8">
        <pre className="bg-theme-secondary rounded p-3 sm:p-4 text-xs sm:text-sm font-mono whitespace-pre-wrap break-words overflow-x-auto text-theme-primary">
          {entryData.body}
        </pre>
      </div>
    );
  }

  return (
    <div className="mb-6 sm:mb-8">
      <div
        className="markdown-body text-sm! max-w-none entry-body"
        dangerouslySetInnerHTML={{ __html: renderedBody }}
      />
    </div>
  );
}

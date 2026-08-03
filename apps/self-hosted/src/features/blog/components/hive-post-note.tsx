'use client';

import { UilExternalLinkAlt } from '@tooni/iconscout-unicons-react';
import { t } from '@/core';

interface Props {
  author: string;
  permlink: string;
  showNote: boolean;
  showPermalink: boolean;
  /** Absolute http(s) URL, already validated, or null for plain text. */
  learnMoreUrl: string | null;
}

/**
 * Where this post lives outside the site: the note that it is on Hive, and the
 * link to its record there.
 *
 * The note is the promotional layer and an owner can suppress it by choosing
 * the `off` posture. It is not one of the three disclosures, which have no
 * setting at all.
 */
export function HivePostNote({
  author,
  permlink,
  showNote,
  showPermalink,
  learnMoreUrl,
}: Props) {
  if (!showNote && !showPermalink) return null;

  // An absolute https literal the type checker cannot fold, so the dead-route
  // guard files it as unresolved and it carries a DYNAMIC_LINKS entry.
  const hiveUrl = `https://hivehub.dev/@${author}/${permlink}`;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-xs text-theme-muted">
      {showNote &&
        (learnMoreUrl ? (
          <a
            href={learnMoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {t('published_on_hive')}
          </a>
        ) : (
          <span>{t('published_on_hive')}</span>
        ))}
      {showPermalink && (
        <a
          href={hiveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline"
        >
          {t('view_on_hive')}
          <UilExternalLinkAlt className="size-3.5" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

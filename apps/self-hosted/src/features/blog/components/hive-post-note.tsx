'use client';

import { UilExternalLinkAlt } from '@tooni/iconscout-unicons-react';
import { InstanceConfigManager, t } from '@/core';

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
  /*
   * Ecency, not a third-party frontend.
   *
   * This was hardcoded to hivehub.dev, so the one link on a hosted blog that
   * says "go see this elsewhere" sent the reader to a competitor, from a site
   * the owner pays us to run, while profile links in the same app already went
   * to ecency.com.
   *
   * Derived from `general.profileBaseUrl` rather than given a base of its own.
   * That value is already `https://ecency.com/@` by default and already decides
   * where an author link goes, so the two cannot drift, and a self-hoster who
   * repoints one has repointed both. `${base}${author}/${permlink}` is the post
   * URL on every Hive frontend that serves `${base}${author}`.
   *
   * Still an absolute https template the type checker cannot fold, so the
   * dead-route guard files it as unresolved and it keeps its DYNAMIC_LINKS
   * entry.
   */
  const profileBaseUrl = InstanceConfigManager.useConfig(
    ({ configuration }) =>
      configuration.general.profileBaseUrl || 'https://ecency.com/@',
  );

  // A hook cannot sit below a conditional return, so the guard follows the read.
  if (!showNote && !showPermalink) return null;

  const hiveUrl = `${profileBaseUrl}${author}/${permlink}`;

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

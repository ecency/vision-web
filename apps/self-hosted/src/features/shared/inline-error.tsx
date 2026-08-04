'use client';

import { UilExclamationTriangle } from '@tooni/iconscout-unicons-react';
import clsx from 'clsx';
import { t } from '@/core';

/**
 * A failure reported next to the content it belongs to, without replacing it.
 *
 * There is no toast layer in this app and this is not the place to introduce
 * one: a message about a feed that failed to extend belongs at the end of that
 * feed, where the reader already is, not floating over a corner of the screen.
 * So this is a strip, it sits inline in the flow it describes, and it carries
 * the retry for exactly that request.
 *
 * `ErrorMessage` stays the right component when there is nothing else on
 * screen. This one is for when there is, so it is quiet and it does not take a
 * screenful.
 */
interface Props {
  /** What failed, in the reader's language. Falls back to the generic line. */
  message?: string;
  /** Retries the one request that failed, not the whole page. */
  onRetry?: () => void;
  className?: string;
}

export function InlineError({ message, onRetry, className }: Props) {
  return (
    <div
      // Announced when it appears, because nothing else changes on screen to
      // signal it: the content the reader already has stays exactly as it was.
      role="alert"
      className={clsx(
        'flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-theme-sm border border-theme px-4 py-3 text-sm text-theme-muted',
        className,
      )}
    >
      <UilExclamationTriangle
        aria-hidden="true"
        className="size-4 shrink-0 text-red-500"
      />
      <span>{message ?? t('error_loading')}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="underline text-theme-accent hover:opacity-70 transition-theme"
        >
          {t('retry')}
        </button>
      )}
    </div>
  );
}

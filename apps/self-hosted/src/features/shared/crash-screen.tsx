'use client';

import type { ErrorInfo } from 'react';
import { t } from '@/core';

/**
 * What a visitor sees when a render throws.
 *
 * Before this, the root boundary fell through to its own default: a 200px box
 * containing the raw `error.message` of a JavaScript exception, an English
 * "Retry" on an instance configured in any of six languages, and no way home.
 * It replaced the masthead, the navigation and the owner's config panel with
 * that box. The 404 next to it in `__root.tsx` was already a full themed page,
 * for the same class of event.
 *
 * Retry is a reload, not a re-render. The boundary's own retry clears its state
 * and renders the identical tree, so a deterministic error fails again in the
 * same frame and the button reads as broken. A reload at least re-runs the app
 * from nothing, and the link out of here is a real navigation for the common
 * case where one route is what crashed.
 */
export function CrashScreen() {
  return (
    <div className="min-h-screen bg-theme-primary flex items-center justify-center">
      <div className="text-center px-4">
        <h1 className="text-2xl sm:text-3xl font-bold mb-4 heading-theme">
          {t('app_error_title')}
        </h1>
        <p className="text-theme-muted mb-8">{t('app_error_description')}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-6 py-2 rounded-lg bg-black text-white hover:bg-black/80 transition-colors font-medium"
          >
            {t('reload_page')}
          </button>
          {/* A plain anchor, not a router Link: the router is part of what may
              have just thrown, and a full document load is the point. */}
          <a
            href="/blog?filter=posts"
            className="px-6 py-2 rounded-lg border border-theme text-theme-primary hover:bg-theme-tertiary transition-colors font-medium"
          >
            {t('back_to_blog')}
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Leaves a record that the blog crashed.
 *
 * The boundary's `componentDidCatch` logs only when NODE_ENV is development,
 * which on a built instance is never, so a crashing blog produced no trace
 * anywhere. This app wires up no error reporting service, so the console is the
 * only place to leave one, and an owner or a support request can find it there.
 */
export function reportRenderCrash(error: Error, errorInfo: ErrorInfo) {
  console.error(
    '[self-hosted] render crash',
    error,
    errorInfo?.componentStack ?? '',
  );
}

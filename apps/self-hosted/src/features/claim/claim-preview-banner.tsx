import { useEffect } from 'react';
import { t } from '@/core';
import { CLAIM_PREVIEW_PARAM } from './claim-preview';
import { parseClaimTarget } from './parse-claim-target';

const HOSTING_URL = 'https://ecency.com/hosting';

/**
 * Persistent bar over an unclaimed subdomain's live preview: says plainly that
 * this is a preview of public Hive content and the name is free, and carries
 * the claim deep link. Also owns the robots noindex while the preview is up,
 * because the claim landing removes its own noindex when it unmounts and an
 * unclaimed host must never enter the index.
 */
export function ClaimPreviewBanner() {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const { name, isCommunity } = parseClaimTarget(host);
  const claimHref = `${HOSTING_URL}?claim=${encodeURIComponent(name)}`;

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);

  const exitPreview = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete(CLAIM_PREVIEW_PARAM);
    // A full load without the param boots back into the claim landing; the
    // preview config only ever lived in this tab's memory.
    window.location.href = url.toString();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-black/90 text-white px-4 py-3">
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 flex-wrap text-sm">
        <span className="opacity-90">
          {t(
            isCommunity
              ? 'claim_preview_banner_community'
              : 'claim_preview_banner_blog',
          )}
        </span>
        <span className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={exitPreview}
            className="underline opacity-75 hover:opacity-100"
          >
            {t('claim_preview_exit')}
          </button>
          <a
            href={claimHref}
            className="px-3 py-1.5 rounded-lg bg-white text-black hover:bg-white/85 font-medium"
          >
            {t('claim_preview_claim')}
          </a>
        </span>
      </div>
    </div>
  );
}

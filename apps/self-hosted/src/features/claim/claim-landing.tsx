import { useEffect } from "react";
import { t } from "@/core";
import { parseClaimTarget } from "./parse-claim-target";
import { enterClaimPreview, isClaimPreviewRequested } from "./claim-preview";

/**
 * Shown on an UNCLAIMED *.blogs.ecency.com subdomain, which nginx serves the shared default
 * template config (carrying `template: true`) because no tenant row exists yet. Instead of a
 * working blog full of someone else's content, it invites the visitor to claim the subdomain.
 *
 * The instance type is derived from the hostname client-side: a `hive-<digits>` label reads as a
 * community, anything else as an author blog. The noindex meta is set here at runtime rather than
 * in the shared static meta.html: that fallback is also served when a CLAIMED tenant's own meta is
 * momentarily missing, so a static noindex there could deindex a live blog. Gating it on the same
 * `template` flag that renders this page keeps it scoped to genuinely unclaimed hosts (Googlebot
 * renders JS, and unclaimed subdomains carry no inbound links to index anyway).
 */
const HOSTING_URL = "https://ecency.com/hosting";
const BASE_DOMAIN = "blogs.ecency.com";

export function ClaimLanding() {
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const { name, isCommunity } = parseClaimTarget(host);
  const title = isCommunity ? t("claim_title_community") : t("claim_title_blog");
  const claimHref = `${HOSTING_URL}?claim=${encodeURIComponent(name)}`;

  // Deep-linked preview (the signup funnel or a shared link): boot straight into the live
  // preview instead of the CTA. Behind an explicit param so crawlers and casual hits keep
  // getting the lightweight landing.
  useEffect(() => {
    if (name && isClaimPreviewRequested(window.location.search)) {
      enterClaimPreview(name, isCommunity);
    }
  }, [name, isCommunity]);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;
    // Keep unclaimed placeholders out of the search index (only ever runs on a `template` host).
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      document.title = prevTitle;
      meta.remove();
    };
  }, [title]);

  return (
    <div className="min-h-screen bg-theme-primary flex items-center justify-center px-4">
      <div className="text-center max-w-lg">
        <div className="text-sm font-medium text-theme-muted mb-3">
          {name}.{BASE_DOMAIN}
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold mb-4 heading-theme">{title}</h1>
        <p className="text-theme-muted mb-8">{t("claim_subtitle")}</p>
        <a
          href={claimHref}
          className="inline-block px-6 py-3 rounded-lg bg-black text-white hover:bg-black/80 transition-colors font-medium"
        >
          {t("claim_cta")}
        </a>
        {name && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => enterClaimPreview(name, isCommunity)}
            className="text-theme-muted underline hover:no-underline"
          >
            {t("claim_preview_cta")}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}

export default ClaimLanding;

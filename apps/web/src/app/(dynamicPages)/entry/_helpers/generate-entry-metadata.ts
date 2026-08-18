import { parseDate, safeDecodeURIComponent } from "@/utils";
import { entryCanonical } from "@/utils/entry-canonical";
import { isIndexable, ReputationSource } from "@/utils/entry-indexability";
import { isValidPermlink } from "@ecency/render-helper";
import { buildEntryCardFields } from "./entry-card-fields";
import type { Entry } from "@/entities";
import { Metadata } from "next";
import { getContentQueryOptions, getProfilesQueryOptions } from "@ecency/sdk";
import { prefetchQuery } from "@/core/react-query";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { getServerAppBase } from "@/utils/server-app-base";
import defaults from "@/defaults.json";

export async function generateEntryMetadata(
  username: string,
  permlink: string
): Promise<Metadata> {
  const cleanPermlink = safeDecodeURIComponent(permlink).trim();
  const base = await getServerAppBase();
  if (!username || !cleanPermlink || cleanPermlink === "undefined" || !isValidPermlink(cleanPermlink)) {
    // Only warn for plausible permlinks — skip file extensions (browser/extension source map requests)
    if (!/\.\w{2,4}$/.test(cleanPermlink)) {
      console.warn("generateEntryMetadata: Missing author or permlink", { username, permlink });
    }
    return {};
  }
  try {
    const cleanAuthor = username.replace(/%40/g, "");

    // Source from condenser_api.get_content first: it returns root_author /
    // root_permlink (needed to canonical replies to their discussion root and
    // to detect container/wave trees), which bridge.get_post omits. This is
    // fetch-count-neutral — bridge is the fallback, already trusted here.
    let entry = null;
    try {
      entry = await prefetchQuery(getContentQueryOptions(cleanAuthor, cleanPermlink));
    } catch (e) {
      console.warn("generateEntryMetadata: get_content failed, trying bridge", e);
    }

    if (!entry || !entry.body || !entry.created) {
      entry = await prefetchQuery(
        EcencyEntriesCacheManagement.getEntryQueryByPath(cleanAuthor, cleanPermlink)
      );
      if (!entry || !entry.body || !entry.created) {
        console.warn("generateEntryMetadata: both content sources failed", {
          username,
          permlink: cleanPermlink
        });
        return {};
      }
    }

    // Shared with the oEmbed provider so the meta-tag card and the oEmbed
    // card can never drift (title/summary/image rules live in one place).
    const { title, summary, cardSummary, image, isComment } = buildEntryCardFields(entry as Entry);

    // Bare /@author/permlink form for this exact page.
    const fullUrl = `${base}/@${entry.author}/${entry.permlink}`;
    const authorUrl = `${base}/@${entry.author}`;
    const createdAt = parseDate(entry.created ?? new Date().toISOString());
    const updatedAt = parseDate(entry.updated ?? entry.last_update ?? entry.created ?? new Date().toISOString());
    const canonical = entryCanonical(entry, base);
    const finalCanonical = canonical ?? fullUrl;
    // og:url must describe THIS page's content (title/desc/image are the
    // entry's). For a reply, rel=canonical points to the discussion root for
    // SEO consolidation, but og:url must stay the reply's own URL — otherwise
    // social scrapers (which key the share object on og:url) attach the
    // reply's card to the root URL. og:url and canonical legitimately differ
    // when a page is canonicalised to a different resource.
    const ogUrl = isComment ? fullUrl : finalCanonical;

    let authorAccount: ReputationSource = null;
    let accountFetchFailed = false;

    try {
      const profiles = await prefetchQuery(
        getProfilesQueryOptions([entry.author])
      );
      authorAccount = profiles?.[0] ?? null;
    } catch (e) {
      accountFetchFailed = true;
      console.warn("generateEntryMetadata: failed to load author account", e);
    }

    const robots = isIndexable(entry, authorAccount, accountFetchFailed)
      ? undefined
      : "noindex, nofollow";

    return {
      title,
      // Authorship is conveyed via the Article JSON-LD author + og/article:author;
      // a bare "@handle" in the SERP snippet spends characters without earning
      // clicks, so the description is the post summary alone (matches og/twitter).
      description: summary,
      robots,
      openGraph: {
        title,
        // Cards use cardSummary (never empty); the SERP meta description above
        // stays the bare summary so media-only posts keep Google's auto-snippet.
        description: cardSummary,
        url: ogUrl,
        // Add alt only. catchPostImage uses aspect-fit (mode=match), so the
        // proxied asset is rarely exactly 1200x630 (and GIF covers may be served
        // at origin size) - declaring fixed dimensions would misreport them.
        images: image ? [{ url: image, alt: title }] : [],
        type: "article",
        publishedTime: createdAt.toISOString(),
        modifiedTime: updatedAt.toISOString(),
        locale: "en_US",
        siteName: "Ecency",
      },
      twitter: {
        card: "summary_large_image",
        // Re-declare site: Next replaces (not merges) the layout's twitter object
        // per segment, so without this the root layout's twitter:site is dropped.
        site: defaults.twitterHandle,
        title,
        description: cardSummary,
        images: image ? [{ url: image, alt: title }] : [],
      },
      other: {
        "article:author": authorUrl,
        "og:updated_time": updatedAt.toISOString(),
      },
      alternates: {
        canonical: finalCanonical,
        // oEmbed discovery: lets consumers (WordPress/Ghost/Discourse/Notion…)
        // auto-unfurl a pasted ecency.com post URL into a rich card. Gated to
        // indexable posts only — suppressed/NSFW/thin posts (robots set)
        // never advertise an embed. Targets the post's own ecency.com URL
        // (fullUrl): the provider resolves by author/permlink and rejects
        // non-ecency hosts, so we must NOT use ogUrl/canonical here — those can
        // be an external site when the author sets json_metadata.canonical_url.
        types:
          robots === undefined
            ? {
                "application/json+oembed": `${base}/api/oembed?url=${encodeURIComponent(
                  fullUrl
                )}&format=json`
              }
            : undefined
      },
    };
  } catch (e) {
    console.error("generateEntryMetadata failed:", e, { username, permlink: cleanPermlink });
    return {};
  }
}

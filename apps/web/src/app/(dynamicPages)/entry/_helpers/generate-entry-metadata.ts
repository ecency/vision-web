import { parseDate, safeDecodeURIComponent } from "@/utils";
import { entryCanonical } from "@/utils/entry-canonical";
import {
  isIndexable,
  ReputationSource,
  threadRoot,
  withoutDeclaredCanonical
} from "@/utils/entry-indexability";
import { isTakenDownPost } from "@/core/dmca-posts";
import { isValidPermlink } from "@ecency/render-helper";
import { buildEntryCardFields } from "./entry-card-fields";
import type { Entry } from "@/entities";
import { Metadata } from "next";
import { getContentQueryOptions, getProfilesQueryOptions } from "@ecency/sdk";
import { markSsrDegraded, prefetchQuery } from "@/core/react-query";
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

    // The author's profile, from the URL so it does not wait for the post. The
    // page prefetches this same query (same key) in the same request, so the
    // render makes one profile lookup for both.
    const profilesPromise = prefetchQuery(getProfilesQueryOptions([cleanAuthor]));

    // The post, from the same query the page prefetches (same key, same
    // arguments: the page normalizes the permlink the same way), so React
    // Query runs it once per render. The one thing bridge.get_post omits is root_author /
    // root_permlink, which canonical and the container-tree check need for a
    // reply two or more levels deep (a post is its own root and a direct
    // reply's parent is its root, see threadRoot). Only then is
    // condenser_api.get_content read, for those two fields.
    let entry: Entry | null | undefined = await prefetchQuery(
      EcencyEntriesCacheManagement.getEntryQueryByPath(cleanAuthor, cleanPermlink)
    );
    if (!entry || !entry.body || !entry.created) {
      console.warn("generateEntryMetadata: post lookup failed", {
        username,
        permlink: cleanPermlink
      });
      return {};
    }
    if (!threadRoot(entry)) {
      try {
        // Not marked on its own: an incomplete thread is marked just below.
        // condenser's row carries root_*, which the SDK's Entry type omits.
        const content = (await prefetchQuery(getContentQueryOptions(cleanAuthor, cleanPermlink), {
          degradeOnFailure: false
        })) as { root_author?: string; root_permlink?: string } | null | undefined;
        if (content?.root_author && content.root_permlink) {
          entry = { ...entry, root_author: content.root_author, root_permlink: content.root_permlink };
        }
      } catch (e) {
        console.warn("generateEntryMetadata: get_content failed for a deep reply", e);
      }
      // Without its root a deeper reply has no canonical and would be
      // noindexed, which must not be cached for the entry tier.
      if (!threadRoot(entry)) markSsrDegraded("fallback-incomplete");
    }
    // bridge hands json_metadata over parsed, so a declared canonical_url would
    // now reach canonicalTarget; the page keeps its own (see its ⛔ note).
    entry = withoutDeclaredCanonical(entry);

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
      const profiles = await profilesPromise;
      authorAccount = profiles?.[0] ?? null;
    } catch (e) {
      accountFetchFailed = true;
      console.warn("generateEntryMetadata: failed to load author account", e);
    }

    // The takedown decides before the gate does, for the same reason
    // loadIndexableEntry checks first: the post queries this reads now filter,
    // and the filter blanks the metadata and the title and
    // replaces the body with the notice. That removes two of isNsfwEntry's
    // three signals and lifts the body over the thin-content floor, so a
    // listed post that used to be noindex would become indexable, and would
    // then also advertise its oEmbed endpoint below (#1862).
    const robots =
      !isTakenDownPost(entry.author, entry.permlink) &&
      isIndexable(entry, authorAccount, accountFetchFailed)
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

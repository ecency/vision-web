import { catchPostImage, postBodySummary } from "@ecency/render-helper";
import defaults from "@/defaults.json";
import { entryDisplayTitle } from "@/utils/entry-display-title";
import { Entry, FullAccount, Community } from "@/entities";

/**
 * Single source of truth for schema.org JSON-LD across the app.
 *
 * The site-wide Organization is emitted once in the root layout under a stable
 * @id (`<base>/#organization`); every other graph node (Article publisher,
 * WebSite publisher, …) references it by @id rather than re-describing it, so
 * Google merges them into one entity without duplication.
 */

const ORG_ID = `${defaults.base}/#organization`;
const ORG_LOGO = `${defaults.base}/assets/logo-512x512.png`;

// Brand profiles, mirrored from the landing-page footer. Used as Organization
// sameAs so Google can tie the social accounts to the brand entity.
const ORG_SAME_AS = [
  "https://twitter.com/ecency_official",
  "https://youtube.com/ecency",
  "https://t.me/ecency",
  "https://discord.me/ecency"
];

const HEADLINE_MAX = 110;

type JsonLdData = Record<string, unknown>;

export function JsonLd({ data }: { data: JsonLdData | JsonLdData[] }) {
  return (
    <script
      type="application/ld+json"
      // Escape `<` so a `</script>` sequence inside any string can't break out.
      // Values originate from on-chain/post data, so this guard matters.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

function avatar(username: string, size: "small" | "medium" | "large" = "medium") {
  return `${defaults.imageServer}/u/${username}/avatar/${size}`;
}

// Hive timestamps come back without a timezone ("2021-01-01T00:00:00"); schema.org
// validators read that as ambiguous local time. Tag bare timestamps as UTC.
function toUtcIso(ts?: string): string | undefined {
  if (!ts) return undefined;
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(ts) ? ts : `${ts}Z`;
}

export function buildOrganizationJsonLd(base: string = defaults.base): JsonLdData {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: defaults.name,
    url: base,
    logo: { "@type": "ImageObject", url: ORG_LOGO, width: 512, height: 512 },
    sameAs: ORG_SAME_AS
  };
}

export function buildWebsiteJsonLd(base: string = defaults.base): JsonLdData {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${base}/#website`,
    name: defaults.name,
    url: base,
    publisher: { "@id": ORG_ID },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${base}/search?q={search_term_string}`
      },
      "query-input": "required name=search_term_string"
    }
  };
}

export function buildBreadcrumbJsonLd(items: { name: string; url: string }[]): JsonLdData {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url
    }))
  };
}

/**
 * Dataset node for data-report pages (e.g. the creator-economy report).
 * CC BY 4.0 license invites citation with attribution.
 */
export function buildDatasetJsonLd({
  name,
  description,
  url,
  temporalCoverage
}: {
  name: string;
  description: string;
  url: string;
  temporalCoverage: string; // ISO interval, e.g. "2025-07-01/2026-06-30"
}): JsonLdData {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name,
    description,
    url,
    temporalCoverage,
    creator: { "@id": ORG_ID },
    license: "https://creativecommons.org/licenses/by/4.0/",
    isAccessibleForFree: true
  };
}

export function buildArticleJsonLd({
  entry,
  account,
  url,
  base = defaults.base
}: {
  entry: Entry;
  account?: FullAccount | null;
  url: string;
  base?: string;
}): JsonLdData {
  // posting_json_metadata is untrusted too: profile.name can be any JSON type.
  const authorName = profileString(account?.profile?.name) || entry.author;
  // entryDisplayTitle: title-less posts get a body-summary headline instead of "".
  const headline = entryDisplayTitle(entry).slice(0, HEADLINE_MAX);
  // Without a metadata/regex hit this falls through to the full markdown
  // parser, whose last-resort path can throw on hostile markdown. The post body
  // guards the same call; an Article without an image beats a 500.
  let image: string | undefined;
  try {
    image = catchPostImage(entry, 1200, 630, "match") || undefined;
  } catch {
    image = undefined;
  }
  // json_metadata is untrusted on-chain data: guard that `tags` is actually an
  // array before filtering to non-empty strings — a truthy non-array value
  // would otherwise throw here, on the entry-page SSR path. (Matches the
  // Array.isArray(tags) guard used elsewhere in the entry components.)
  const rawTags = entry.json_metadata?.tags;
  const keywords = (Array.isArray(rawTags) ? rawTags : []).filter(
    (t): t is string => typeof t === "string" && t.length > 0
  );
  // The community/category is the post's section. `community_title` is a
  // bridge-only field; when it's absent for a community post, `category` is a
  // raw machine id ("hive-12345") that's meaningless as a section signal, so
  // omit it in that case rather than leak the id.
  const articleSection =
    entry.community_title ||
    (/^hive-\d+$/.test(entry.category ?? "") ? undefined : entry.category) ||
    undefined;

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline,
    description:
      (typeof entry.json_metadata?.description === "string" && entry.json_metadata.description) ||
      postBodySummary(entry.body, 160),
    image: image ? [image] : undefined,
    datePublished: toUtcIso(entry.created),
    dateModified: toUtcIso(entry.updated ?? entry.created),
    author: {
      "@type": "Person",
      name: authorName,
      url: `${base}/@${entry.author}`,
      image: avatar(entry.author)
    },
    publisher: { "@id": ORG_ID },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    articleSection,
    // schema.org `keywords` is Text — emit the conventional comma-separated form.
    keywords: keywords.length ? keywords.join(", ") : undefined,
    commentCount: entry.children,
    interactionStatistic: entry.children
      ? {
          "@type": "InteractionCounter",
          interactionType: "https://schema.org/CommentAction",
          userInteractionCount: entry.children
        }
      : undefined
  };
}

function profileString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

export function buildProfileJsonLd({
  account,
  username,
  base = defaults.base
}: {
  account?: FullAccount | null;
  username: string;
  base?: string;
}): JsonLdData {
  // posting_json_metadata is untrusted: any of these can be a non-string.
  const displayName = profileString(account?.profile?.name) || username;
  const about = profileString(account?.profile?.about);
  const website = profileString(account?.profile?.website);

  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    dateCreated: toUtcIso(account?.created),
    mainEntity: {
      "@type": "Person",
      name: displayName,
      alternateName: `@${username}`,
      identifier: username,
      url: `${base}/@${username}`,
      image: avatar(username, "large"),
      description: about || undefined,
      sameAs: website ? [website] : undefined,
      interactionStatistic: account?.follow_stats
        ? [
            {
              "@type": "InteractionCounter",
              interactionType: "https://schema.org/FollowAction",
              userInteractionCount: account.follow_stats.follower_count
            }
          ]
        : undefined
    }
  };
}

export function buildCommunityJsonLd({
  community,
  path,
  base = defaults.base
}: {
  community: Community;
  path: string;
  base?: string;
}): JsonLdData {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: community.title?.trim() || community.name,
    url: `${base}${path}`,
    logo: { "@type": "ImageObject", url: avatar(community.name, "large") },
    description: community.about?.trim() || community.description?.trim() || undefined
  };
}

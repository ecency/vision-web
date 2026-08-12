import { callRPC } from '@ecency/sdk/hive';
import type { Tenant } from '../types';
import { ConfigService, escapeHtml } from './config-service';
import { TenantService } from './tenant-service';

/**
 * Per-post head metadata for link unfurls. The SPA sets OG tags client-side,
 * which crawlers do not execute, so post URLs unfurled as the generic site
 * card. The nginx SSI include now asks this service for the ORIGINAL request
 * URI: a post URL answers with the post's own title, excerpt and cover
 * image, anything else with the tenant-level snippet. Everything here lands
 * verbatim in visitor HTML, so every chain-sourced string is escaped.
 */

/** `/@author/permlink` or `/category/@author/permlink`, tolerating a query. */
export function parsePostPath(
  uri: unknown,
): { author: string; permlink: string } | null {
  if (typeof uri !== 'string') return null;
  const path = uri.split(/[?#]/)[0].replace(/\/+$/, '');
  const match = /^\/(?:[a-z0-9-]+\/)?@([a-z][a-z0-9.-]{2,15})\/([a-z0-9-]+)$/.exec(
    path,
  );
  if (!match) return null;
  return { author: match[1], permlink: match[2] };
}

interface CachedPost {
  post: any | null;
  at: number;
}

// A small in-process TTL cache in front of the chain call; nginx's proxy
// cache sits above this too, so a hot post costs one RPC per TTL per node.
const POST_TTL_MS = 5 * 60 * 1000;
const POST_CACHE_MAX = 500;
const postCache = new Map<string, CachedPost>();

/** Test seam: module memory otherwise leaks between cases. */
export function resetPostMetaCache(): void {
  postCache.clear();
}

// The SSI subrequest blocks the page's HTML on this endpoint, so the chain
// call gets a hard bound far below the SDK's own retry budget: a slow RPC
// answers as a missing post (tenant snippet) instead of stalling every
// uncached post view. The nginx location carries its own proxy timeouts as
// the second layer.
const RPC_TIMEOUT_MS = 2500;

async function getPostCached(author: string, permlink: string): Promise<any | null> {
  const key = `${author}/${permlink}`;
  const hit = postCache.get(key);
  if (hit && Date.now() - hit.at < POST_TTL_MS) return hit.post;

  let post: any | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    post =
      ((await Promise.race([
        callRPC('bridge.get_post', { author, permlink, observer: '' }),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('post meta rpc timeout')),
            RPC_TIMEOUT_MS,
          );
        }),
      ])) as any) ?? null;
  } catch {
    // A chain hiccup or timeout answers like a missing post: the
    // tenant-level snippet. The null is cached like any answer, so a slow
    // chain costs one bounded wait per post per TTL, not one per view.
    post = null;
  } finally {
    clearTimeout(timer);
  }

  if (postCache.size >= POST_CACHE_MAX) {
    // Plain FIFO eviction: insertion order is enough for a bounded cache
    // whose entries all expire in minutes anyway.
    const oldest = postCache.keys().next().value;
    if (oldest !== undefined) postCache.delete(oldest);
  }
  postCache.set(key, { post, at: Date.now() });
  return post;
}

/** Strip markdown/html noise the way an excerpt should read. */
function excerptOf(body: unknown, max = 200): string {
  if (typeof body !== 'string') return '';
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[`*_>~|]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** The post's cover: json_metadata image first, then the first body image. */
function coverOf(post: any): string | null {
  const metaImage = post?.json_metadata?.image?.[0];
  if (typeof metaImage === 'string' && /^https?:\/\//i.test(metaImage)) {
    return metaImage;
  }
  const body = typeof post?.body === 'string' ? post.body : '';
  const md = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/.exec(body);
  if (md) return md[1];
  const html = /<img[^>]+src=["'](https?:\/\/[^\s"']+)["']/.exec(body);
  if (html) return html[1];
  return null;
}

function proxyBaseOf(tenant: Tenant): string {
  const configured = (tenant.config as any)?.configuration?.general?.imageProxy;
  return typeof configured === 'string' && /^https?:\/\//i.test(configured)
    ? configured.replace(/\/+$/, '')
    : 'https://i.ecency.com';
}

/**
 * The head snippet for one post. Falls back to the tenant snippet whenever
 * the URI is not a post or the post cannot be resolved, so this endpoint
 * always answers with something true about the site.
 */
export async function buildMetaForUri(tenant: Tenant, uri: unknown): Promise<string> {
  const parsed = parsePostPath(uri);
  if (!parsed) return ConfigService.buildMetaHtml(tenant);

  const post = await getPostCached(parsed.author, parsed.permlink);
  if (!post || typeof post.title !== 'string' || !post.title.trim()) {
    return ConfigService.buildMetaHtml(tenant);
  }

  const siteMeta =
    (tenant.config as any)?.configuration?.instanceConfiguration?.meta ?? {};
  const siteName = escapeHtml(
    (typeof siteMeta.title === 'string' && siteMeta.title.trim()) ||
      `${tenant.username} blog`,
  );
  const title = escapeHtml(post.title.trim());
  // parsePostPath constrains the author to [a-z0-9.-], so the fallback text
  // needs no escaping of its own; the excerpt is chain text and gets it.
  const description = escapeHtml(
    excerptOf(post.body) || `A post by @${parsed.author}`,
  );

  const coverRaw = coverOf(post);
  // Unfurl targets get a crawler-friendly size through the image proxy; the
  // raw URL is chain-authored and untrusted, so it is escaped like the rest.
  const ogImage = coverRaw
    ? escapeHtml(`${proxyBaseOf(tenant)}/1200x630/${coverRaw}`)
    : null;

  const canonical = escapeHtml(
    `${TenantService.getBlogUrl(tenant)}/@${parsed.author}/${parsed.permlink}`,
  );

  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="${siteName}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    ...(ogImage ? [`<meta property="og:image" content="${ogImage}" />`] : []),
    `<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}" />`,
    '',
  ].join('\n');
}

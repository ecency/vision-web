import { callRPC } from '@ecency/sdk/hive';
import type { Tenant } from '../types';
import { escapeHtml } from '../utils/escape-html';
import { excerptOf } from '../utils/excerpt';
import { TenantService } from './tenant-service';

/**
 * Per-tenant static SEO files: robots.txt (with its Sitemap line),
 * sitemap.xml and rss.xml, written into the served configs volume by the
 * periodic sync pass. Static by design: crawlers and feed readers read
 * files nginx serves from disk, and no request ever waits on the chain.
 *
 * Everything in these files is chain- or owner-authored and lands in
 * documents other parsers read, so URLs and text are escaped for the
 * containing format.
 */

/**
 * Canonical policy (decided 2026-08): a tenant with a VERIFIED custom domain
 * has invested in its own address and canonicalizes to itself; a subdomain
 * tenant canonicalizes to the ecency.com SSR page, whose rendered HTML
 * indexes better than an empty-before-JS SPA body. og:url stays the served
 * URL either way; only rel=canonical follows the policy.
 */
export function canonicalHomeUrl(tenant: Tenant): string {
  if (tenant.customDomain && tenant.customDomainVerified) {
    return TenantService.getBlogUrl(tenant);
  }
  const { community, communityId } = isCommunityTenant(tenant);
  return community
    ? `https://ecency.com/created/${communityId}`
    : `https://ecency.com/@${tenant.username}`;
}

export function canonicalPostUrl(
  tenant: Tenant,
  author: string,
  permlink: string,
): string {
  if (tenant.customDomain && tenant.customDomainVerified) {
    return `${TenantService.getBlogUrl(tenant)}/@${author}/${permlink}`;
  }
  return `https://ecency.com/@${author}/${permlink}`;
}

/** How many posts feeds and sitemaps carry; one bridge page. */
const POST_LIMIT = 100;
/** A pass regenerates a tenant's files only when they are older than this. */
export const SEO_FRESH_MS = 30 * 60 * 1000;
/** The background pass is patient but never unbounded. */
const RPC_TIMEOUT_MS = 10_000;

interface TenantPost {
  author: string;
  permlink: string;
  title: string;
  created: string;
  updated?: string;
  body?: string;
}

function isCommunityTenant(tenant: Tenant): {
  community: boolean;
  communityId: string;
} {
  const instance = (tenant.config as any)?.configuration?.instanceConfiguration;
  const community = instance?.type === 'community';
  return {
    community,
    communityId:
      typeof instance?.communityId === 'string' && instance.communityId
        ? instance.communityId
        : tenant.username,
  };
}

/**
 * A bounded AND aborted chain call: the per-attempt timeout goes to the SDK
 * and the controller cancels the request outright at the same deadline, so a
 * timed-out fetch stops consuming a socket instead of racing on unobserved.
 */
async function boundedCall<T>(method: string, params: object): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    return await callRPC<T>(method, params, RPC_TIMEOUT_MS, undefined, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** The tenant's latest posts, the same feeds the archive itself pages. */
export async function fetchTenantPosts(tenant: Tenant): Promise<TenantPost[]> {
  const { community, communityId } = isCommunityTenant(tenant);
  const raw = community
    ? await boundedCall<unknown>('bridge.get_ranked_posts', {
        sort: 'created',
        tag: communityId,
        limit: POST_LIMIT,
        observer: '',
      })
    : await boundedCall<unknown>('bridge.get_account_posts', {
        sort: 'posts',
        account: tenant.username,
        limit: POST_LIMIT,
        observer: '',
      });
  // A malformed answer is an ERROR, never an empty blog: returning [] here
  // would overwrite a good sitemap and feed with empty ones and mark them
  // fresh, while throwing lets the sync pass keep yesterday's files.
  if (!Array.isArray(raw)) {
    throw new Error('malformed bridge feed response');
  }
  // Every field the builders touch is type-checked here: a malformed record
  // (a numeric date, a missing permlink) is dropped or normalized instead of
  // failing the tenant's whole SEO pass on an .endsWith of a number.
  const posts: TenantPost[] = [];
  for (const p of raw as any[]) {
    if (
      typeof p?.author !== 'string' ||
      typeof p?.permlink !== 'string' ||
      typeof p?.created !== 'string'
    ) {
      continue;
    }
    posts.push({
      author: p.author,
      permlink: p.permlink,
      title: typeof p.title === 'string' ? p.title : '',
      created: p.created,
      updated: typeof p.updated === 'string' ? p.updated : undefined,
      body: typeof p.body === 'string' ? p.body : undefined,
    });
  }
  return posts;
}

export function buildRobotsTxt(tenant: Tenant): string {
  const blogUrl = TenantService.getBlogUrl(tenant);
  return ['User-agent: *', 'Allow: /', `Sitemap: ${blogUrl}/sitemap.xml`, ''].join(
    '\n',
  );
}

/** W3C datetime for <lastmod>; bridge dates carry no zone and mean UTC. */
function lastmodOf(post: TenantPost): string | null {
  const raw = post.updated || post.created;
  if (!raw) return null;
  const parsed = Date.parse(raw.endsWith('Z') ? raw : `${raw}Z`);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

export function buildSitemapXml(tenant: Tenant, posts: TenantPost[]): string {
  const blogUrl = TenantService.getBlogUrl(tenant);
  const urls: string[] = [
    `  <url><loc>${escapeHtml(blogUrl + '/')}</loc></url>`,
    `  <url><loc>${escapeHtml(blogUrl + '/about')}</loc></url>`,
  ];
  for (const post of posts) {
    const loc = escapeHtml(`${blogUrl}/@${post.author}/${post.permlink}`);
    const lastmod = lastmodOf(post);
    urls.push(
      lastmod
        ? `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod></url>`
        : `  <url><loc>${loc}</loc></url>`,
    );
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

/** RFC 822 for <pubDate>, the format RSS 2.0 readers expect. */
function pubDateOf(post: TenantPost): string | null {
  const raw = post.created;
  if (!raw) return null;
  const parsed = Date.parse(raw.endsWith('Z') ? raw : `${raw}Z`);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toUTCString();
}

export function buildRssXml(tenant: Tenant, posts: TenantPost[]): string {
  const blogUrl = TenantService.getBlogUrl(tenant);
  const meta = (tenant.config as any)?.configuration?.instanceConfiguration?.meta ?? {};
  const title = escapeHtml(
    (typeof meta.title === 'string' && meta.title.trim()) ||
      `${tenant.username} blog`,
  );
  const description = escapeHtml(
    (typeof meta.description === 'string' && meta.description.trim()) ||
      'A blog powered by Hive blockchain and Ecency.',
  );

  const items = posts.map((post) => {
    const link = escapeHtml(`${blogUrl}/@${post.author}/${post.permlink}`);
    const itemTitle = escapeHtml(
      (typeof post.title === 'string' && post.title.trim()) ||
        `@${post.author}/${post.permlink}`,
    );
    const pubDate = pubDateOf(post);
    return [
      '    <item>',
      `      <title>${itemTitle}</title>`,
      `      <link>${link}</link>`,
      `      <guid isPermaLink="true">${link}</guid>`,
      ...(pubDate ? [`      <pubDate>${pubDate}</pubDate>`] : []),
      `      <description>${escapeHtml(excerptOf(post.body))}</description>`,
      '    </item>',
    ].join('\n');
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${title}</title>`,
    `    <link>${escapeHtml(blogUrl)}</link>`,
    `    <description>${description}</description>`,
    `    <atom:link href="${escapeHtml(blogUrl + '/rss.xml')}" rel="self" type="application/rss+xml" />`,
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

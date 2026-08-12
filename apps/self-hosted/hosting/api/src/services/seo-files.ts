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

/**
 * How many posts feeds and sitemaps carry, and how they are collected.
 *
 * The bridge asserts `limit` into [1:20] and answers an ERROR, not a shorter
 * list, when asked for more: a single limit=100 call failed every tenant's
 * pass in production, so the wanted depth is PAGED at the bridge's own page
 * size. The whole walk carries one deadline as well as the per-call one, so
 * a chain that answers slowly costs a bounded pass rather than page count
 * times the per-call timeout.
 */
const POST_LIMIT = 100;
const BRIDGE_PAGE_LIMIT = 20;
const FETCH_BUDGET_MS = 30_000;
/** Below this much budget left, a further page is not worth starting. */
const MIN_CALL_MS = 1_000;
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

/**
 * One feed record, narrowed from an unknown chain answer. Every field the
 * builders touch is checked here: a malformed record (a numeric date, a
 * missing permlink) is dropped or normalized instead of failing the
 * tenant's whole SEO pass on an .endsWith of a number.
 */
function toTenantPost(entry: unknown): TenantPost | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const record = entry as Record<string, unknown>;
  const { author, permlink, created, title, updated, body } = record;
  if (
    typeof author !== 'string' ||
    typeof permlink !== 'string' ||
    typeof created !== 'string'
  ) {
    return null;
  }
  return {
    author,
    permlink,
    created,
    title: typeof title === 'string' ? title : '',
    updated: typeof updated === 'string' ? updated : undefined,
    body: typeof body === 'string' ? body : undefined,
  };
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
async function boundedCall<T>(
  method: string,
  params: object,
  timeoutMs: number = RPC_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await callRPC<T>(method, params, timeoutMs, undefined, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** The tenant's latest posts, the same feeds the archive itself pages. */
export async function fetchTenantPosts(tenant: Tenant): Promise<TenantPost[]> {
  const { community, communityId } = isCommunityTenant(tenant);
  const method = community
    ? 'bridge.get_ranked_posts'
    : 'bridge.get_account_posts';
  const feedParams = community
    ? { sort: 'created', tag: communityId, observer: '' }
    : { sort: 'posts', account: tenant.username, observer: '' };

  const posts: TenantPost[] = [];
  const seen = new Set<string>();
  const deadline = Date.now() + FETCH_BUDGET_MS;
  let cursor: { start_author: string; start_permlink: string } | null = null;

  while (posts.length < POST_LIMIT) {
    // The whole-walk budget bounds the NEXT call rather than being noticed
    // after it: checking only afterwards let a page that starts just inside
    // the budget run a further full per-call timeout past it.
    const remaining = deadline - Date.now();
    if (remaining <= MIN_CALL_MS) break;
    // One extra slot on follow-up pages. Cursor inclusivity varies by node
    // (today's answer both feeds exclusively, this repo's own paginator
    // documents the opposite), and on an inclusive node the echoed cursor
    // would eat a slot from the last short ask and end the walk one post
    // early. The identity set below still does the actual de-duplication.
    const need = POST_LIMIT - posts.length;
    const ask = Math.min(BRIDGE_PAGE_LIMIT, cursor ? need + 1 : need);
    const raw = await boundedCall<unknown>(
      method,
      { ...feedParams, limit: ask, ...(cursor ?? {}) },
      Math.min(RPC_TIMEOUT_MS, remaining),
    );
    // A malformed answer is an ERROR, never an empty blog: returning [] here
    // would overwrite a good sitemap and feed with empty ones and mark them
    // fresh, while throwing lets the sync pass keep yesterday's files.
    if (!Array.isArray(raw)) {
      throw new Error('malformed bridge feed response');
    }
    const page: unknown[] = raw;
    let added = 0;
    let last: { author: string; permlink: string } | null = null;
    for (const entry of page) {
      const post = toTenantPost(entry);
      if (!post) continue;
      last = { author: post.author, permlink: post.permlink };
      // The cursor is exclusive on today's bridge, but a node that echoes the
      // start post back would otherwise repeat a page forever; the identity
      // set makes the walk terminate either way.
      const key = `${post.author}/${post.permlink}`;
      if (seen.has(key)) continue;
      seen.add(key);
      added++;
      posts.push(post);
    }
    // A page shorter than what it was ASKED for is the end of the feed; no
    // new posts or no usable record means paging further cannot help.
    if (page.length < ask || added === 0 || !last) break;
    cursor = { start_author: last.author, start_permlink: last.permlink };
  }
  // The reserved slot can overshoot by one on an exclusive node.
  return posts.slice(0, POST_LIMIT);
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

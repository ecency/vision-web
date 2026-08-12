import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callRPC: vi.fn(),
}));

vi.mock('@ecency/sdk/hive', () => ({ callRPC: mocks.callRPC }));
vi.mock('./tenant-service', () => ({
  TenantService: {
    getBlogUrl: (t: any) =>
      t.customDomain && t.customDomainVerified
        ? `https://${t.customDomain}`
        : `https://${t.username}.blogs.ecency.com`,
  },
}));

const {
  buildRobotsTxt,
  buildRssXml,
  buildSitemapXml,
  canonicalHomeUrl,
  canonicalPostUrl,
  fetchTenantPosts,
} = await import('./seo-files');

const TENANT = {
  username: 'alice',
  customDomain: null,
  customDomainVerified: false,
  config: {
    configuration: {
      instanceConfiguration: { meta: { title: 'Alice writes', description: 'Notes' } },
    },
  },
} as any;

const CUSTOM_TENANT = {
  ...TENANT,
  customDomain: 'blog.alice.example',
  customDomainVerified: true,
} as any;

const POSTS = [
  {
    author: 'alice',
    permlink: 'first-post',
    title: 'First <post>',
    created: '2026-08-01T10:00:00',
    updated: '2026-08-02T11:00:00',
    body: 'Some **words** and ![img](https://a.b/c.png)',
  },
];

describe('seo file builders', () => {
  it('robots carries the sitemap line for the served domain', () => {
    expect(buildRobotsTxt(TENANT)).toBe(
      'User-agent: *\nAllow: /\nSitemap: https://alice.blogs.ecency.com/sitemap.xml\n',
    );
  });

  it('sitemap lists home, about and posts with W3C lastmod', () => {
    const xml = buildSitemapXml(TENANT, POSTS as any);
    expect(xml).toContain('<loc>https://alice.blogs.ecency.com/</loc>');
    expect(xml).toContain('<loc>https://alice.blogs.ecency.com/about</loc>');
    expect(xml).toContain(
      '<loc>https://alice.blogs.ecency.com/@alice/first-post</loc>',
    );
    expect(xml).toContain('<lastmod>2026-08-02T11:00:00.000Z</lastmod>');
  });

  it('rss escapes chain text and stamps RFC822 dates with a self link', () => {
    const xml = buildRssXml(TENANT, POSTS as any);
    expect(xml).toContain('<title>Alice writes</title>');
    expect(xml).toContain('<title>First &lt;post&gt;</title>');
    expect(xml).not.toContain('<post>');
    expect(xml).toContain('<pubDate>Sat, 01 Aug 2026 10:00:00 GMT</pubDate>');
    expect(xml).toContain(
      'href="https://alice.blogs.ecency.com/rss.xml" rel="self"',
    );
    expect(xml).toContain('Some words and');
  });
});

describe('canonical policy', () => {
  it('a verified custom domain canonicalizes to itself', () => {
    expect(canonicalHomeUrl(CUSTOM_TENANT)).toBe('https://blog.alice.example');
    expect(canonicalPostUrl(CUSTOM_TENANT, 'alice', 'p')).toBe(
      'https://blog.alice.example/@alice/p',
    );
  });

  it('a subdomain tenant canonicalizes to the ecency.com SSR pages', () => {
    expect(canonicalHomeUrl(TENANT)).toBe('https://ecency.com/@alice');
    expect(canonicalPostUrl(TENANT, 'alice', 'p')).toBe(
      'https://ecency.com/@alice/p',
    );
    const community = {
      ...TENANT,
      username: 'hive-125125',
      config: {
        configuration: {
          instanceConfiguration: { type: 'community', communityId: 'hive-125125' },
        },
      },
    } as any;
    expect(canonicalHomeUrl(community)).toBe(
      'https://ecency.com/created/hive-125125',
    );
  });
});

describe('fetchTenantPosts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pages the account feed for a blog and the ranked feed for a community', async () => {
    mocks.callRPC.mockResolvedValue(POSTS);
    await fetchTenantPosts(TENANT);
    expect(mocks.callRPC).toHaveBeenCalledWith(
      'bridge.get_account_posts',
      expect.objectContaining({ account: 'alice', sort: 'posts' }),
      expect.any(Number),
      undefined,
      expect.any(AbortSignal),
    );
    // The bridge asserts limit into [1:20] and ERRORS above it, so a page may
    // never ask for more; asking for 100 failed every tenant in production.
    for (const call of mocks.callRPC.mock.calls) {
      expect(call[1].limit).toBeLessThanOrEqual(20);
    }

    const community = {
      ...TENANT,
      config: {
        configuration: {
          instanceConfiguration: { type: 'community', communityId: 'hive-1' },
        },
      },
    } as any;
    await fetchTenantPosts(community);
    expect(mocks.callRPC).toHaveBeenCalledWith(
      'bridge.get_ranked_posts',
      expect.objectContaining({ tag: 'hive-1', sort: 'created' }),
      expect.any(Number),
      undefined,
      expect.any(AbortSignal),
    );
  });

  it('walks pages with an exclusive cursor up to the wanted depth', async () => {
    // Six full pages exist; the walk wants 100 posts, so it stops after five.
    const page = (n: number) =>
      Array.from({ length: 20 }, (_, i) => ({
        author: 'alice',
        permlink: `p${n}-${i}`,
        created: '2026-08-01T00:00:00',
      }));
    mocks.callRPC.mockImplementation(async (_m: string, params: any) =>
      page(Number(params.start_permlink?.split('-')[0]?.replace('p', '') ?? -1) + 1),
    );

    const posts = await fetchTenantPosts(TENANT);
    expect(posts).toHaveLength(100);
    expect(mocks.callRPC).toHaveBeenCalledTimes(5);
    // Each page after the first carries the previous page's last post as the
    // cursor, and every returned post is distinct.
    expect(mocks.callRPC.mock.calls[1][1]).toMatchObject({
      start_author: 'alice',
      start_permlink: 'p0-19',
    });
    expect(new Set(posts.map((p) => p.permlink)).size).toBe(100);
  });

  it('stops on a short page instead of asking for one more', async () => {
    mocks.callRPC.mockResolvedValue(
      Array.from({ length: 3 }, (_, i) => ({
        author: 'alice',
        permlink: `only-${i}`,
        created: '2026-08-01T00:00:00',
      })),
    );
    const posts = await fetchTenantPosts(TENANT);
    expect(posts).toHaveLength(3);
    expect(mocks.callRPC).toHaveBeenCalledTimes(1);
  });

  it('terminates when a node echoes the cursor post back forever', async () => {
    // An inclusive-cursor node would otherwise repeat its last page for ever:
    // a full page whose posts are all already seen ends the walk.
    const repeated = Array.from({ length: 20 }, (_, i) => ({
      author: 'alice',
      permlink: `same-${i}`,
      created: '2026-08-01T00:00:00',
    }));
    mocks.callRPC.mockResolvedValue(repeated);
    const posts = await fetchTenantPosts(TENANT);
    expect(posts).toHaveLength(20);
    expect(mocks.callRPC).toHaveBeenCalledTimes(2);
  });

  it('throws on a malformed response so stale files are kept, never blanked', async () => {
    mocks.callRPC.mockResolvedValue({ nope: true });
    await expect(fetchTenantPosts(TENANT)).rejects.toThrow('malformed');
  });

  it('drops or normalizes malformed records instead of failing the pass', async () => {
    mocks.callRPC.mockResolvedValue([
      { author: 'a', permlink: 'p', created: 1 },
      { author: 'a', permlink: 'q', created: '2026-08-01T00:00:00', updated: 7, title: 9 },
    ]);
    const posts = await fetchTenantPosts(TENANT);
    expect(posts).toEqual([
      {
        author: 'a',
        permlink: 'q',
        title: '',
        created: '2026-08-01T00:00:00',
        updated: undefined,
        body: undefined,
      },
    ]);
  });
});

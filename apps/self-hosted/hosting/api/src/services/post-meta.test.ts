import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callRPC: vi.fn(),
  getBlogUrl: vi.fn(() => 'https://alice.blogs.ecency.com'),
}));

vi.mock('@ecency/sdk/hive', () => ({ callRPC: mocks.callRPC }));
vi.mock('./tenant-service', () => ({
  TenantService: { getBlogUrl: mocks.getBlogUrl },
}));

const { buildMetaForUri, parsePostPath, resetPostMetaCache } = await import(
  './post-meta'
);

const TENANT = {
  username: 'alice',
  config: {
    configuration: {
      general: {},
      instanceConfiguration: { meta: { title: 'Alice writes' } },
    },
  },
} as any;

describe('parsePostPath', () => {
  it('accepts the two post URL shapes and nothing else', () => {
    expect(parsePostPath('/@alice/my-post')).toEqual({
      author: 'alice',
      permlink: 'my-post',
    });
    expect(parsePostPath('/travel/@alice/my-post/')).toEqual({
      author: 'alice',
      permlink: 'my-post',
    });
    expect(parsePostPath('/@alice/my-post?ref=x#frag')).toEqual({
      author: 'alice',
      permlink: 'my-post',
    });
    expect(parsePostPath('/blog?filter=hot')).toBeNull();
    expect(parsePostPath('/about')).toBeNull();
    expect(parsePostPath('/')).toBeNull();
    expect(parsePostPath(undefined)).toBeNull();
  });
});

describe('buildMetaForUri', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPostMetaCache();
    mocks.getBlogUrl.mockReturnValue('https://alice.blogs.ecency.com');
  });

  it('answers the tenant snippet for non-post URIs without touching the chain', async () => {
    const html = await buildMetaForUri(TENANT, '/blog?filter=hot');
    expect(html).toContain('<title>Alice writes</title>');
    expect(mocks.callRPC).not.toHaveBeenCalled();
  });

  it('builds per-post tags with escaped chain text and a proxied cover', async () => {
    mocks.callRPC.mockResolvedValue({
      title: 'My <script>daring</script> post',
      body: `![cover](https://img.example/raw.png)\n\nSome **words** to read here.`,
      json_metadata: { image: ['https://img.example/meta.png'] },
    });

    const html = await buildMetaForUri(TENANT, '/@alice/my-post');

    expect(mocks.callRPC).toHaveBeenCalledWith('bridge.get_post', {
      author: 'alice',
      permlink: 'my-post',
      observer: '',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('og:type" content="article"');
    expect(html).toContain(
      'og:image" content="https://i.ecency.com/1200x630/https://img.example/meta.png"',
    );
    expect(html).toContain('Some words to read here');
    expect(html).toContain(
      'og:url" content="https://alice.blogs.ecency.com/@alice/my-post"',
    );
    expect(html).toContain('twitter:card" content="summary_large_image"');
  });

  it('caches the chain lookup: one RPC serves repeat unfurls', async () => {
    mocks.callRPC.mockResolvedValue({ title: 'T', body: 'words here' });
    await buildMetaForUri(TENANT, '/@alice/my-post');
    await buildMetaForUri(TENANT, '/@alice/my-post');
    expect(mocks.callRPC).toHaveBeenCalledTimes(1);
  });

  it('falls back to the tenant snippet for a missing post or a chain failure', async () => {
    mocks.callRPC.mockResolvedValueOnce(null);
    expect(await buildMetaForUri(TENANT, '/@alice/gone')).toContain(
      '<title>Alice writes</title>',
    );
    mocks.callRPC.mockRejectedValueOnce(new Error('rpc down'));
    expect(await buildMetaForUri(TENANT, '/@alice/erroring')).toContain(
      '<title>Alice writes</title>',
    );
  });
});

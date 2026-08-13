import { describe, expect, it, vi } from 'vitest';

interface ComposeResponse {
  config?: {
    version: number;
    configuration: {
      general: Record<string, unknown>;
      instanceConfiguration: Record<string, unknown> & { meta?: Record<string, unknown> };
    };
  };
  error?: string;
}

// The DB client is imported transitively; nothing in this route may reach it,
// and a mock that throws proves it rather than assuming it.
vi.mock('../db/client', () => ({
  db: new Proxy(
    {},
    {
      get() {
        throw new Error('compose-config must not touch the database');
      },
    },
  ),
}));

// ConfigService writes into the SERVED volume: publishing a file there puts a
// blog live, which an anonymous caller must never be able to do.
vi.mock('../services/config-service', () => ({
  ConfigService: new Proxy(
    {},
    {
      get() {
        throw new Error('compose-config must not publish a config file');
      },
    },
  ),
}));

vi.mock('@ecency/sdk/hive', () => ({
  callRPC: vi.fn(async () => ({ title: 'A Community' })),
  config: { set: vi.fn() },
}));

const { toolsRoutes, withoutServedOnlyMarkers } = await import('./tools');

async function compose(body: unknown) {
  const res = await toolsRoutes.request('http://localhost/compose-config', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { res, body: (await res.json()) as ComposeResponse };
}

/** The composed instance block, which every assertion below reads. */
function instanceOf(body: ComposeResponse): Record<string, unknown> {
  return body.config!.configuration.instanceConfiguration;
}

describe('POST /v1/tools/compose-config', () => {
  it('composes a blog config owned by its own account, creating nothing', async () => {
    const { res, body } = await compose({
      username: 'alice',
      config: { title: 'Alice writes', styleTemplate: 'journal', accent: '#112233' },
    });

    expect(res.status).toBe(200);
    expect(body.config!.version).toBe(1);
    const instance = instanceOf(body);
    expect(instance.username).toBe('alice');
    // The instance reads this to decide who may open its editor.
    expect(instance.owner).toBe('alice');
    expect((instance.meta as Record<string, unknown>).title).toBe('Alice writes');
    const general = body.config!.configuration.general;
    expect(general.styleTemplate).toBe('journal');
    expect((general.styles as Record<string, unknown>).accent).toBe('#112233');
  });

  it('strips every marker that only makes sense on a managed instance', async () => {
    const { body } = await compose({ username: 'alice' });
    const instance = instanceOf(body);
    // managed would point the editor's Save at a hosting API that is not
    // theirs; template would replace the site with the claim landing page.
    expect(instance).not.toHaveProperty('managed');
    expect(instance).not.toHaveProperty('template');
    expect(instance).not.toHaveProperty('claimPreview');
    // An Ecency-owned Hivesigner app only answers to Ecency's redirect URIs.
    expect(body.config!.configuration.general).not.toHaveProperty('hivesigner');
  });

  it('requires a separate owner for a community, which cannot administer itself', async () => {
    const missing = await compose({
      username: 'hive-125125',
      config: { type: 'community', communityId: 'hive-125125' },
    });
    expect(missing.res.status).toBe(400);
    expect(missing.body.error).toMatch(/separate owner/);

    const self = await compose({
      username: 'hive-125125',
      owner: 'hive-125125',
      config: { type: 'community', communityId: 'hive-125125' },
    });
    expect(self.res.status).toBe(400);

    // Another community as owner is the same lockout: that account holds no
    // keys either, so nobody could ever open the editor.
    const otherCommunity = await compose({
      username: 'hive-125125',
      owner: 'hive-99999',
      config: { type: 'community', communityId: 'hive-125125' },
    });
    expect(otherCommunity.res.status).toBe(400);

    const ok = await compose({
      username: 'hive-125125',
      owner: 'alice',
      config: { type: 'community', communityId: 'hive-125125' },
    });
    expect(ok.res.status).toBe(200);
    const instance = instanceOf(ok.body);
    expect(instance.type).toBe('community');
    // The named owner, not the community itself, is what the editor gates on.
    expect(instance.owner).toBe('alice');
    expect(instance.communityId).toBe('hive-125125');
  });

  it('rejects a name the chain could never carry, like createTenant does', async () => {
    // Same regex as createTenantSchema: Hive account names are lowercase, so
    // an uppercase owner is a client bug, not something to normalize away.
    const { res } = await compose({
      username: 'hive-125125',
      owner: 'Alice',
      config: { type: 'community', communityId: 'hive-125125' },
    });
    expect(res.status).toBe(400);
  });

  it('treats a hive-NNNN name as a community even when the body does not say so', async () => {
    // Reading only config.type let this compose a BLOG owned by the keyless
    // community account: the real administrator could never open the editor,
    // and the feed would read an account that never posts.
    for (const config of [undefined, { type: 'blog' as const }]) {
      const { res, body } = await compose({ username: 'hive-125125', owner: 'alice', config });
      expect(res.status, JSON.stringify(config)).toBe(200);
      const instance = instanceOf(body);
      expect(instance.owner).toBe('alice');
      expect(instance.type).toBe('community');
      expect(instance.communityId).toBe('hive-125125');
    }

    // And it still refuses without a separate owner, by the same rule.
    const noOwner = await compose({ username: 'hive-125125' });
    expect(noOwner.res.status).toBe(400);
  });

  it('refuses a subdomain and community id that disagree', async () => {
    // The document pins BOTH names. Letting them differ would compose a
    // site called hive-125125 that serves hive-99999's feed, which the
    // managed create path rejects for the same reason.
    const { res, body } = await compose({
      username: 'hive-125125',
      owner: 'alice',
      config: { type: 'community', communityId: 'hive-99999' },
    });
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/must equal/);
  });

  it('rejects a community id that is not shaped like one', async () => {
    const { res } = await compose({
      username: 'notacommunity',
      owner: 'alice',
      config: { type: 'community', communityId: 'notacommunity' },
    });
    expect(res.status).toBe(400);
  });

  it('rejects values outside the shared rosters instead of composing junk', async () => {
    for (const config of [
      { styleTemplate: 'not-a-template' },
      { accent: 'red' },
      { fontPreset: 'comic-sans' },
    ]) {
      const { res } = await compose({ username: 'alice', config });
      expect(res.status, JSON.stringify(config)).toBe(400);
    }
    const badName = await compose({ username: 'A' });
    expect(badName.res.status).toBe(400);
  });
});

describe('withoutServedOnlyMarkers', () => {
  it('leaves everything else untouched and does not mutate its input', () => {
    const document = {
      version: 1,
      configuration: {
        general: {
          theme: 'system',
          hivesigner: { clientId: 'ecency.app', extra: 'kept' },
        },
        instanceConfiguration: { username: 'alice', managed: true, meta: { title: 'T' } },
      },
    };
    const stripped = withoutServedOnlyMarkers(document);

    expect(stripped.configuration).toMatchObject({
      general: { theme: 'system', hivesigner: { extra: 'kept' } },
      instanceConfiguration: { username: 'alice', meta: { title: 'T' } },
    });
    // The caller's document is untouched: this is a copy, not a mutation.
    expect(document.configuration.instanceConfiguration.managed).toBe(true);
    expect(document.configuration.general.hivesigner.clientId).toBe('ecency.app');
  });

  it('removes a hivesigner block the strip leaves empty', () => {
    const stripped = withoutServedOnlyMarkers({
      configuration: { general: { hivesigner: { clientId: 'ecency.app' } } },
    });
    // An empty hivesigner block reads as a deliberately blank app id.
    expect(stripped.configuration).toEqual({ general: {} });
  });
});

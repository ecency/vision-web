import { mkdtempSync } from 'fs';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

// CONFIG_DIR is read at module load; point it at a temp dir BEFORE importing the service.
process.env.CONFIG_DIR = mkdtempSync(path.join(tmpdir(), 'hosting-cfg-'));
const { ConfigService, withTenantWriteLock } = await import('./config-service');
const { TenantService } = await import('./tenant-service');

const tenant = (username: string, title: string) =>
  ({
    username,
    subscriptionStatus: 'active',
    config: {
      version: 1,
      configuration: {
        general: { theme: 'system' },
        instanceConfiguration: { username, meta: { title } },
      },
    },
  }) as any;

describe('withTenantWriteLock', () => {
  it('serializes operations per tenant, in submission order', async () => {
    const order: string[] = [];
    const slow = withTenantWriteLock('alice', async () => {
      await new Promise((r) => setTimeout(r, 30));
      order.push('first');
    });
    const fast = withTenantWriteLock('alice', async () => {
      order.push('second');
    });
    await Promise.all([slow, fast]);
    expect(order).toEqual(['first', 'second']);
  });

  it('runs the next operation even when the previous one failed', async () => {
    const failing = withTenantWriteLock('bob', async () => {
      throw new Error('boom');
    });
    await expect(failing).rejects.toThrow('boom');
    await expect(withTenantWriteLock('bob', async () => 'ok')).resolves.toBe('ok');
  });
});

describe('ConfigService.generateConfigFile', () => {
  it('writes the config with the managed flag injected and repairs drift', async () => {
    const configPath = await ConfigService.generateConfigFile(tenant('carol', 'One'));
    const written = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    expect(written.configuration.instanceConfiguration.managed).toBe(true);
    expect(written.configuration.instanceConfiguration.meta.title).toBe('One');

    // External drift is repaired on the next pass.
    await fs.writeFile(configPath, '{"tampered":true}', 'utf-8');
    await ConfigService.generateConfigFile(tenant('carol', 'One'));
    const repaired = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    expect(repaired.configuration.instanceConfiguration.meta.title).toBe('One');
  });

  it('publishes by rename and leaves no staging residue behind', async () => {
    const configPath = await ConfigService.generateConfigFile(tenant('trent', 'Atomic'));
    const siblings = await fs.readdir(path.dirname(configPath));
    expect(siblings.filter((f) => f.includes('.tmp-'))).toEqual([]);
    const written = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    expect(written.configuration.instanceConfiguration.meta.title).toBe('Atomic');
  });

  it('a newer write is not clobbered by an older concurrent write', async () => {
    // Simulates the sync-vs-update race: an older (slow) generation submitted first and a
    // newer one submitted second must finish with the newer content on disk.
    const oldWrite = ConfigService.generateConfigFile(tenant('dave', 'stale'));
    const newWrite = ConfigService.generateConfigFile(tenant('dave', 'fresh'));
    await Promise.all([oldWrite, newWrite]);

    const onDisk = JSON.parse(
      await fs.readFile(ConfigService.getConfigPath('dave'), 'utf-8')
    );
    expect(onDisk.configuration.instanceConfiguration.meta.title).toBe('fresh');
  });
});

describe('ConfigService.syncAllConfigs ordering', () => {
  it('re-reads the tenant INSIDE the write lock, and publishes what that read returns', async () => {
    // The pass holds a snapshot; the row must be read only once the tenant's write chain
    // is free, so an update whose file write was enqueued earlier has fully finished and
    // the sync can never publish older data than the concurrent write.
    let chainFreed = false;
    let readRanAfterChainFreed = false;
    const spy = vi
      .spyOn(TenantService, 'getByUsername')
      .mockImplementation(async () => {
        readRanAfterChainFreed = chainFreed;
        return tenant('erin', 'fresh');
      });

    try {
      // Occupy erin's chain (stands in for an update's in-flight file write).
      const inFlightUpdate = withTenantWriteLock('erin', async () => {
        await new Promise((r) => setTimeout(r, 30));
        chainFreed = true;
      });
      const sync = ConfigService.syncAllConfigs([tenant('erin', 'stale-snapshot')]);
      await Promise.all([inFlightUpdate, sync]);

      expect(readRanAfterChainFreed).toBe(true);
      const onDisk = JSON.parse(
        await fs.readFile(ConfigService.getConfigPath('erin'), 'utf-8')
      );
      expect(onDisk.configuration.instanceConfiguration.meta.title).toBe('fresh');
    } finally {
      spy.mockRestore();
    }
  });

  it('a deletion enqueued after a sync write leaves the file deleted', async () => {
    const spy = vi
      .spyOn(TenantService, 'getByUsername')
      .mockImplementation(async () => tenant('frank', 'anything'));

    try {
      const sync = ConfigService.syncAllConfigs([tenant('frank', 'snapshot')]);
      const deletion = ConfigService.deleteConfigFile('frank');
      await Promise.all([sync, deletion]);

      await expect(fs.access(ConfigService.getConfigPath('frank'))).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
  });

  it('sync removes the served file of a never-activated (inactive) tenant', async () => {
    // The free-blog hole: a file written for an unpaid tenant must be swept so nginx stops
    // serving it. Write one, then run a sync whose active set does not include it.
    await ConfigService.generateConfigFile(tenant('grace', 'Grace'));
    await expect(fs.access(ConfigService.getConfigPath('grace'))).resolves.toBeUndefined();

    const spy = vi
      .spyOn(TenantService, 'getByUsername')
      .mockImplementation(async (u: string) =>
        u === 'grace' ? { ...tenant('grace', 'Grace'), subscriptionStatus: 'inactive' } : null
      );
    try {
      await ConfigService.syncAllConfigs([]); // no active tenants
      await expect(fs.access(ConfigService.getConfigPath('grace'))).rejects.toThrow();
      await expect(fs.access(ConfigService.getMetaPath('grace'))).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
  });

  it('sync removes the served file of a reclaimed (abandoned) tenant', async () => {
    // Once the sweep marks a stale row 'abandoned' it must not keep serving; sync treats
    // abandoned like inactive and removes any leftover file (a status-skip would strand it).
    await ConfigService.generateConfigFile(tenant('gone', 'Gone'));
    await expect(fs.access(ConfigService.getConfigPath('gone'))).resolves.toBeUndefined();

    const spy = vi
      .spyOn(TenantService, 'getByUsername')
      .mockImplementation(async (u: string) =>
        u === 'gone' ? { ...tenant('gone', 'Gone'), subscriptionStatus: 'abandoned' } : null
      );
    try {
      await ConfigService.syncAllConfigs([]);
      await expect(fs.access(ConfigService.getConfigPath('gone'))).rejects.toThrow();
      await expect(fs.access(ConfigService.getMetaPath('gone'))).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('ConfigService.buildMetaHtml', () => {
  it('uses the tenant title/description and a generated <title>/OG tags', () => {
    const html = ConfigService.buildMetaHtml(
      tenant('dan', 'Dan’s Blog') as any
    );
    expect(html).toContain('<title>Dan’s Blog</title>');
    expect(html).toContain('<meta property="og:title" content="Dan’s Blog" />');
    expect(html).toContain('<link rel="icon"');
  });

  it('HTML-escapes owner-supplied title and description (they land in every visitor page)', () => {
    const malicious = {
      username: 'evil',
      config: {
        configuration: {
          instanceConfiguration: {
            meta: {
              title: '</title><script>alert(1)</script>',
              description: '"><img src=x onerror=alert(1)>',
            },
          },
        },
      },
    } as any;
    const html = ConfigService.buildMetaHtml(malicious);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;&gt;&lt;img');
  });

  it('emits og:image from the configured logo, http(s)-validated like the favicon', () => {
    const withLogo = {
      username: 'dan',
      config: {
        configuration: {
          instanceConfiguration: {
            meta: { title: 'Dan', logo: 'https://cdn.example/logo.png' },
          },
        },
      },
    } as any;
    const html = ConfigService.buildMetaHtml(withLogo);
    expect(html).toContain(
      '<meta property="og:image" content="https://cdn.example/logo.png" />',
    );
    expect(html).toContain('twitter:card" content="summary_large_image"');

    // Anything that is not an http(s) URL emits no image tag at all.
    const junkLogo = {
      username: 'dan',
      config: {
        configuration: {
          instanceConfiguration: {
            meta: { title: 'Dan', logo: 'javascript:alert(1)' },
          },
        },
      },
    } as any;
    const junkHtml = ConfigService.buildMetaHtml(junkLogo);
    expect(junkHtml).not.toContain('og:image');
    expect(junkHtml).toContain('twitter:card" content="summary"');
  });

  it('only allows an http(s) favicon, else falls back to the bundled icon', () => {
    const withJs = {
      username: 'x',
      config: {
        configuration: {
          instanceConfiguration: { meta: { favicon: 'javascript:alert(1)' } },
        },
      },
    } as any;
    expect(ConfigService.buildMetaHtml(withJs)).toContain('href="/favicon.ico"');

    const withHttps = {
      username: 'x',
      config: {
        configuration: {
          instanceConfiguration: { meta: { favicon: 'https://cdn.example.com/f.png' } },
        },
      },
    } as any;
    expect(ConfigService.buildMetaHtml(withHttps)).toContain(
      'href="https://cdn.example.com/f.png"'
    );
  });
});

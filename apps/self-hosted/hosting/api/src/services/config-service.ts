/**
 * Config Service
 *
 * Manages tenant config files on disk
 */

import { promises as fs } from 'fs';
import path from 'path';
import { withAdvisoryLock } from '../db/client';
import { escapeHtml } from '../utils/escape-html';
import { TenantService, type Tenant } from './tenant-service';
import {
  buildRobotsTxt,
  buildRssXml,
  buildSitemapXml,
  canonicalHomeUrl,
  fetchTenantPosts,
  SEO_FRESH_MS,
} from './seo-files';

const CONFIG_DIR = process.env.CONFIG_DIR || '/app/configs';

// Re-exported for existing consumers; the implementation lives in its own
// util so seo-files can use it without importing this module back
// (config-service consumes seo-files below).
export { escapeHtml } from '../utils/escape-html';

// Per-tenant write chains: every config-file write for a tenant runs strictly after the
// previous one, so the periodic sync and a concurrent tenant update can never interleave.
// Bounded by tenant count; entries are never removed (tiny, and removal would race).
const writeChains = new Map<string, Promise<void>>();

/**
 * Serialize an async operation per tenant. The next operation runs regardless of whether
 * the previous one failed; the caller still sees its own operation's result or error.
 */
// Advisory lock coordinates: a fixed namespace plus a stable hash of the tenant,
// so both containers derive the same lock for the same tenant without depending
// on a Postgres internal like hashtext().
const CONFIG_LOCK_NAMESPACE = 0x6563;

function tenantLockKey(username: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < username.length; i++) {
    hash ^= username.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

export function withTenantWriteLock<T>(username: string, fn: () => Promise<T>): Promise<T> {
  const key = username.toLowerCase();
  // The in-process chain orders this process's own writes; the advisory lock
  // orders them against the other container. Both are needed: the chain alone
  // cannot see across processes, and taking only the advisory lock would let
  // two writes from THIS process interleave while one waits on the database.
  const guarded = () =>
    withAdvisoryLock(CONFIG_LOCK_NAMESPACE, tenantLockKey(key), fn);
  const prev = writeChains.get(key) ?? Promise.resolve();
  const run = prev.then(guarded, guarded);
  writeChains.set(
    key,
    run.then(
      () => undefined,
      () => undefined
    )
  );
  return run;
}

/**
 * Whether a tenant's config may be published to the served directory.
 *
 * nginx serves any file that exists with no subscription check, so publishing
 * for a tenant that has never paid puts a free blog live until the next sweep
 * removes it. syncAllConfigs writes only for 'active'; every other publication
 * path has to agree with it, which is why this predicate is shared rather than
 * repeated.
 */
export function isPublishableTenant(tenant: Pick<Tenant, 'subscriptionStatus'>): boolean {
  return tenant.subscriptionStatus === 'active';
}

export const ConfigService = {
  /**
   * Generate config file for a tenant. Writes are serialized per tenant (see
   * withTenantWriteLock), so a sync-pass write and an update write cannot interleave.
   */
  generateConfigFile(tenant: Tenant): Promise<string> {
    return withTenantWriteLock(tenant.username, () => this.writeConfigFile(tenant));
  },

  /** The actual write; only ever invoked under the per-tenant lock. */
  async writeConfigFile(tenant: Tenant): Promise<string> {
    const configPath = this.getConfigPath(tenant.username);

    // Ensure directory exists
    await fs.mkdir(CONFIG_DIR, { recursive: true });

    // Head-metadata snippet served into the static HTML via nginx SSI, so link unfurls
    // and crawlers see the blog's real title instead of a build-tool default (the SPA
    // only sets the title at runtime, which unfurlers never execute).
    await this.writeIfChanged(
      this.getMetaPath(tenant.username),
      this.buildMetaHtml(tenant)
    );

    // Serve-time copy marks the instance as managed so the app enables managed-hosting
    // features (config saves) on any hostname, including verified custom domains where the
    // subdomain heuristic can't identify the tenant. Injected here rather than stored so
    // truly self-hosted configs can never carry it.
    const config = {
      ...tenant.config,
      configuration: {
        ...tenant.config?.configuration,
        instanceConfiguration: {
          ...tenant.config?.configuration?.instanceConfiguration,
          managed: true,
        },
      },
    };

    const content = JSON.stringify(config, null, 2);

    if (await this.writeIfChanged(configPath, content)) {
      console.log('[ConfigService] Generated config:', configPath);
    }
    return configPath;
  },

  /**
   * Write `content` to `path` unless the file already holds it, so the periodic sync
   * doesn't rewrite every file each pass. Returns true when a write happened.
   */
  async writeIfChanged(path: string, content: string): Promise<boolean> {
    try {
      const existing = await fs.readFile(path, 'utf-8');
      if (existing === content) {
        return false;
      }
    } catch {
      // Missing or unreadable: write it.
    }
    await fs.writeFile(path, content, 'utf-8');
    return true;
  },

  /**
   * The SSI head snippet for a tenant: title, description, OG/Twitter tags and favicon.
   * Title and description are OWNER-SUPPLIED and land verbatim in every visitor's HTML,
   * so they are HTML-escaped here; the favicon must be an http(s) URL or it falls back.
   */
  buildMetaHtml(tenant: Tenant): string {
    const meta = tenant.config?.configuration?.instanceConfiguration?.meta ?? ({} as any);
    const title = escapeHtml(
      (typeof meta.title === 'string' && meta.title.trim()) || `${tenant.username} blog`
    );
    const description = escapeHtml(
      (typeof meta.description === 'string' && meta.description.trim()) ||
        'A blog powered by Hive blockchain and Ecency.'
    );
    const faviconRaw = typeof meta.favicon === 'string' ? meta.favicon.trim() : '';
    const favicon = /^https?:\/\//i.test(faviconRaw) ? escapeHtml(faviconRaw) : '/favicon.ico';

    // The configured logo doubles as the site's unfurl image, with the same
    // http(s)-only validation the favicon gets: anything else emits no tag
    // at all rather than a broken (or worse) URL in every visitor's HTML.
    const logoRaw = typeof meta.logo === 'string' ? meta.logo.trim() : '';
    const ogImage = /^https?:\/\//i.test(logoRaw) ? escapeHtml(logoRaw) : null;

    return [
      `<title>${title}</title>`,
      `<meta name="description" content="${description}" />`,
      `<meta property="og:title" content="${title}" />`,
      `<meta property="og:description" content="${description}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="${title}" />`,
      ...(ogImage
        ? [
            `<meta property="og:image" content="${ogImage}" />`,
            `<meta name="twitter:image" content="${ogImage}" />`,
          ]
        : []),
      `<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}" />`,
      // Custom-domain tenants canonicalize to themselves, subdomain tenants
      // to the ecency.com SSR page (see canonicalHomeUrl); the feed link is
      // in the SSI snippet so crawlers see it, not only JS runtimes.
      `<link rel="canonical" href="${escapeHtml(canonicalHomeUrl(tenant))}" />`,
      `<link rel="alternate" type="application/rss+xml" title="${title}" href="${escapeHtml(TenantService.getBlogUrl(tenant) + '/rss.xml')}" />`,
      `<link rel="icon" href="${favicon}" />`,
      '',
    ].join('\n');
  },

  /** Path of a tenant's SSI head-metadata snippet. */
  getMetaPath(username: string): string {
    return path.join(CONFIG_DIR, username.toLowerCase() + '.meta.html');
  },

  /** Paths of a tenant's static SEO files (robots, sitemap, rss). */
  getSeoPaths(username: string): { robots: string; sitemap: string; rss: string } {
    const base = path.join(CONFIG_DIR, username.toLowerCase());
    return {
      robots: `${base}.robots.txt`,
      sitemap: `${base}.sitemap.xml`,
      rss: `${base}.rss.xml`,
    };
  },

  /**
   * Regenerate a tenant's static SEO files when they are stale. Called from
   * the sync pass inside the per-tenant lock. Freshness is mtime-based, so
   * after an unchanged regeneration the files are touched: writeIfChanged
   * deliberately skips identical writes, and without the touch every later
   * pass would refetch the feed for a blog that has not posted.
   */
  async writeSeoFilesIfStale(tenant: Tenant): Promise<void> {
    const paths = this.getSeoPaths(tenant.username);
    const all = [paths.robots, paths.sitemap, paths.rss];

    let fresh = true;
    for (const p of all) {
      try {
        const stat = await fs.stat(p);
        if (Date.now() - stat.mtimeMs > SEO_FRESH_MS) {
          fresh = false;
          break;
        }
      } catch {
        fresh = false;
        break;
      }
    }
    if (fresh) return;

    // One bounded chain page; a failure here is caught by the sync pass's
    // per-tenant isolation and yesterday's files keep serving.
    const posts = await fetchTenantPosts(tenant);
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await this.writeIfChanged(paths.robots, buildRobotsTxt(tenant));
    await this.writeIfChanged(paths.sitemap, buildSitemapXml(tenant, posts));
    await this.writeIfChanged(paths.rss, buildRssXml(tenant, posts));

    const now = new Date();
    for (const p of all) {
      await fs.utimes(p, now, now).catch(() => {});
    }
  },

  /**
   * Delete config file for a tenant. Serialized through the same per-tenant lock as
   * writes, so an in-flight sync write cannot resurrect the file after deletion.
   */
  deleteConfigFile(username: string): Promise<void> {
    return withTenantWriteLock(username, () => this.removeConfigFileUnlocked(username));
  },

  /** The actual unlink; only ever invoked under the per-tenant lock. */
  async removeConfigFileUnlocked(username: string): Promise<void> {
    const seo = this.getSeoPaths(username);
    for (const filePath of [
      this.getConfigPath(username),
      this.getMetaPath(username),
      seo.robots,
      seo.sitemap,
      seo.rss,
    ]) {
      try {
        await fs.unlink(filePath);
        console.log('[ConfigService] Deleted config:', filePath);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }
    }
  },

  /**
   * Read config file for a tenant
   */
  async readConfigFile(username: string): Promise<any | null> {
    const configPath = this.getConfigPath(username);

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  },

  /**
   * Check if config file exists
   */
  async configFileExists(username: string): Promise<boolean> {
    const configPath = this.getConfigPath(username);

    try {
      await fs.access(configPath);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * List every tenant username that has ANY served file on disk (config .json OR .meta.html).
   * The reconcile sweep keys off this, so a tenant whose .json was removed but whose
   * .meta.html lingered (partial delete failure) is still revisited and cleaned up.
   */
  async listConfigFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(CONFIG_DIR);
      const names = new Set<string>();
      for (const f of files) {
        if (f === 'default.json') continue;
        if (f.endsWith('.meta.html')) names.add(f.slice(0, -'.meta.html'.length));
        else if (f.endsWith('.robots.txt')) names.add(f.slice(0, -'.robots.txt'.length));
        else if (f.endsWith('.sitemap.xml')) names.add(f.slice(0, -'.sitemap.xml'.length));
        else if (f.endsWith('.rss.xml')) names.add(f.slice(0, -'.rss.xml'.length));
        else if (f.endsWith('.json')) names.add(f.slice(0, -'.json'.length));
      }
      return [...names];
    } catch {
      return [];
    }
  },

  /**
   * Sync all tenant configs to disk
   */
  /**
   * Publish a tenant's served config from the row as it stands INSIDE the lock.
   *
   * Callers that hold a tenant object read it before doing other work, so
   * publishing that snapshot can overwrite a newer config another process
   * committed in between. Re-reading under the lock removes the window instead
   * of narrowing it.
   */
  async publishConfigFile(username: string): Promise<void> {
    return withTenantWriteLock(username, async () => {
      const fresh = await TenantService.getByUsername(username);
      if (!fresh || fresh.subscriptionStatus !== 'active') return;
      await this.writeConfigFile(fresh);
    });
  },

  async syncAllConfigs(activeTenants: Tenant[]): Promise<void> {
    console.log('[ConfigService] Syncing', activeTenants.length, 'active configs to disk...');

    const activeNames = new Set(activeTenants.map((t) => t.username.toLowerCase()));

    // Per-tenant isolation: one bad write must not abort the rest of the rollout.
    let failed = 0;
    for (const tenant of activeTenants) {
      try {
        // The pass iterates a snapshot, so the row is re-read INSIDE the per-tenant lock:
        // any update or deletion that enqueued its file operation first has fully finished
        // by the time this read runs, so the sync can never publish older data than what a
        // concurrent operation just wrote (a re-read before enqueueing would leave exactly
        // that window). The unlocked writer is used because the lock is not reentrant.
        await withTenantWriteLock(tenant.username, async () => {
          const fresh = await TenantService.getByUsername(tenant.username);
          if (!fresh || !isPublishableTenant(fresh)) return;
          await this.writeConfigFile(fresh);
          await this.writeSeoFilesIfStale(fresh);
        });
      } catch (err) {
        failed++;
        console.error(
          `[ConfigService] Sync failed for ${tenant.username}:`,
          (err as Error).message
        );
      }
    }

    // Remove files for tenants that were NEVER activated (status 'inactive'), that the sweep
    // reclaimed ('abandoned'), or whose row is gone. nginx serves any file that exists with no
    // subscription check, so a file left behind for a non-serving tenant keeps a free blog live
    // forever. Expired/suspended tenants are intentionally left serving (accepted grace-period
    // behavior) and handled elsewhere.
    const removableStatuses = new Set(['inactive', 'abandoned']);
    let removed = 0;
    for (const username of await this.listConfigFiles()) {
      if (activeNames.has(username.toLowerCase())) continue;
      try {
        const tenant = await TenantService.getByUsername(username);
        if (tenant && !removableStatuses.has(tenant.subscriptionStatus)) continue;
        await this.deleteConfigFile(username);
        removed++;
      } catch (err) {
        console.error(
          `[ConfigService] Failed to remove stale config for ${username}:`,
          (err as Error).message
        );
      }
    }

    console.log(
      `[ConfigService] Sync complete${failed ? ` with ${failed} write failure(s)` : ''}` +
        (removed ? `, removed ${removed} stale file(s)` : '')
    );
  },

  /**
   * Get config file path for a username
   */
  getConfigPath(username: string): string {
    return path.join(CONFIG_DIR, username.toLowerCase() + '.json');
  },
};

export default ConfigService;

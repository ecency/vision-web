/**
 * Owner-run SEO generator for INDEPENDENT deployments: the same builders the
 * managed sync pass uses, producing robots.txt, sitemap.xml and rss.xml for
 * one instance from its config.json. Run it on a cron and mount the output
 * beside the app (see apps/self-hosted/DEPLOYMENT.md):
 *
 *   npm run generate-seo -- \
 *     --config /path/to/config.json \
 *     --url https://blog.example.com \
 *     --out /path/to/seo
 *
 * Or through the published image, with no local Node at all:
 *
 *   docker run --rm -v "$PWD:/work" ecency/hosting-api \
 *     npm run generate-seo -- --config /work/config.json \
 *     --url https://blog.example.com --out /work/seo
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  buildRobotsTxt,
  buildRssXml,
  buildSitemapXml,
  fetchTenantPosts,
} from '../src/services/seo-files';
import type { Tenant } from '../src/types';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const configPath = arg('config');
  const url = arg('url');
  const outDir = arg('out') || '.';
  if (!configPath || !url || !/^https:\/\/[^/]+$/i.test(url)) {
    console.error(
      'Usage: npm run generate-seo -- --config <config.json> --url https://your.domain --out <dir>',
    );
    process.exit(1);
  }

  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const instance = config?.configuration?.instanceConfiguration ?? {};
  const username: unknown = instance.username || instance.communityId;
  if (typeof username !== 'string' || !username) {
    console.error('config.json carries no instanceConfiguration.username');
    process.exit(1);
  }

  // A synthetic tenant whose "custom domain" is the owner's own URL: the
  // builders then emit that domain everywhere, and the canonical policy
  // (own domain = canonicalize to self) applies exactly as it does for a
  // managed custom-domain tenant.
  const host = new URL(url).host;
  const tenant = {
    username,
    customDomain: host,
    customDomainVerified: true,
    config,
  } as unknown as Tenant;

  const posts = await fetchTenantPosts(tenant);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'robots.txt'), buildRobotsTxt(tenant));
  await fs.writeFile(
    path.join(outDir, 'sitemap.xml'),
    buildSitemapXml(tenant, posts),
  );
  await fs.writeFile(path.join(outDir, 'rss.xml'), buildRssXml(tenant, posts));
  console.log(
    `Wrote robots.txt, sitemap.xml, rss.xml (${posts.length} posts) to ${outDir}`,
  );
}

main().catch((e) => {
  console.error('generate-seo failed:', (e as Error).message);
  process.exit(1);
});

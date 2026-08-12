import { Hono } from 'hono';
import { TenantService } from '../services/tenant-service';
import { buildMetaForUri } from '../services/post-meta';

/**
 * GET /v1/meta/:username?uri=<original request uri>
 *
 * The head snippet nginx's SSI include injects into every served page. The
 * subrequest carries the ORIGINAL request URI, so a post URL unfurls with
 * the post's own title, excerpt and cover while everything else keeps the
 * tenant-level snippet. nginx proxy-caches the answer per tenant and URI and
 * falls back to the on-disk snippet when this endpoint is unreachable, so
 * serving pages never depends on it.
 */
export const metaRoutes = new Hono();

metaRoutes.get('/:username', async (c) => {
  const username = c.req.param('username').toLowerCase();
  const tenant = await TenantService.getByUsername(username);
  if (!tenant) {
    // 404 sends nginx to its static fallback chain.
    return c.text('Not found', 404);
  }

  const html = await buildMetaForUri(tenant, c.req.query('uri'));
  c.header('Content-Type', 'text/html; charset=utf-8');
  // The nginx proxy cache in front honors this; direct callers get it too.
  c.header('Cache-Control', 'public, max-age=300');
  return c.body(html);
});

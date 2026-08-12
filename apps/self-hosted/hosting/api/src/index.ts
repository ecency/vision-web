/**
 * Ecency Hosting API
 * 
 * Manages multi-tenant blog hosting subscriptions
 */

import { Hono } from 'hono';
import { version as apiVersion } from '../package.json';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { tenantRoutes } from './routes/tenants';
import { templateRoutes } from './routes/templates';
import { domainRoutes } from './routes/domains';
import { paymentRoutes } from './routes/payments';
import { authRoutes } from './routes/auth';
import { metaRoutes } from './routes/meta';
import { internalRoutes, internalSecret, MIN_INTERNAL_SECRET_LENGTH } from './routes/internal';
import { rateLimit } from './middleware/rate-limit';
import { sourceAllowlist } from './middleware/source-allowlist';
import { errorHandler } from './middleware/error-handler';
import { db } from './db/client';
import { TenantService } from './services/tenant-service';
import { ConfigService } from './services/config-service';
import {
  isVerifiedDomainOrigin,
  refreshVerifiedDomainOrigins,
  startVerifiedDomainRefresh,
} from './utils/cors-domains';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', secureHeaders());
const baseDomain = process.env.BASE_DOMAIN || 'blogs.ecency.com';
app.use('*', cors({
  origin: (origin) => {
    const allowed = [
      'https://ecency.com',
      'https://alpha.ecency.com',
      `https://${baseDomain}`,
      'http://localhost:3000',
    ];
    if (allowed.includes(origin)) return origin;
    // Allow any subdomain of the base domain (tenant blogs)
    if (origin.endsWith(`.${baseDomain}`) && origin.startsWith('https://')) return origin;
    // Verified custom domains are tenant sites too (cached set, refreshed from the DB)
    if (origin.startsWith('https://') && isVerifiedDomainOrigin(origin)) return origin;
    return null;
  },
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-payment'],
  exposeHeaders: ['x-payment', 'x-payment-response'],
}));

// Health check (before rate limiting so container probes are never throttled)
// Version and sha identify the running build, so skew between the paired
// blog and API images (built from one commit, tagged independently) is
// observable instead of a guess.
app.get('/health', (c) =>
  c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: apiVersion,
    sha: process.env.GIT_SHA || 'unknown',
  }),
);

// Per-IP rate limiting. A general budget on all public routes caps the unauthenticated
// tenant-creation + RPC-amplification abuse; a tighter budget on /v1/auth throttles the
// challenge/verify/hivesigner endpoints, which each spend an RPC or external call per hit.
// /v1/internal is reachable from the public internet and its only gate is a shared secret,
// so it gets a budget too: generous enough that ePoints' fulfillment never notices, tight
// enough that the secret cannot be guessed online and that each attempt cannot keep opening
// a database transaction.
const generalLimit = rateLimit({ name: 'api', limit: 180, windowMs: 60_000 });
const authLimit = rateLimit({ name: 'auth', limit: 30, windowMs: 60_000 });
const internalLimit = rateLimit({ name: 'internal', limit: 600, windowMs: 60_000 });
app.use('/v1/tenants/*', generalLimit);
app.use('/v1/tenants', generalLimit);
app.use('/v1/domains/*', generalLimit);
app.use('/v1/payments/*', generalLimit);
app.use('/v1/templates', generalLimit);
app.use('/v1/meta/*', generalLimit);
app.use('/v1/auth/*', generalLimit);
app.use('/v1/auth/*', authLimit);

// Source-address allowlist for the service-to-service routes, ahead of the rate limit so a
// refused source never spends a Redis round trip. Defence in depth behind the edge nginx,
// which does the same check but is not on the path of anything that reaches the container
// directly. Unset/empty allows everything: this deploys straight to production with no
// staging tier, so it has to be switched on deliberately after the fact. Which state it is
// in is logged at construction, next to the shared-secret startup line below.
app.use(
  '/v1/internal/*',
  sourceAllowlist({ name: 'internal', value: process.env.HOSTING_INTERNAL_ALLOWED_IPS })
);
app.use('/v1/internal/*', internalLimit);

// API Routes
app.route('/v1/tenants', tenantRoutes);
app.route('/v1/templates', templateRoutes);
app.route('/v1/domains', domainRoutes);
app.route('/v1/payments', paymentRoutes);
app.route('/v1/auth', authRoutes);
// Head snippets for the blog nginx's SSI include (per-post unfurls). Reached
// through the docker network by the blog container, cached by its proxy
// cache; rate limiting matches the other public GET surfaces.
app.route('/v1/meta', metaRoutes);
// Service-to-service only (shared-secret guarded); mounted at its own /v1/internal prefix.
app.route('/v1/internal', internalRoutes);

// Error handling. Driver text never reaches the caller; see middleware/error-handler.
app.onError(errorHandler);

// 404 handler
app.notFound((c) => c.json({ error: 'Not found' }, 404));

// Start server
const port = parseInt(process.env.PORT || '3001', 10);

console.log(`Ecency Hosting API starting on port ${port}...`);

export default {
  port,
  fetch: app.fetch,
};

// Regenerate every active tenant's served config file (idempotent: identical files are
// left untouched). Errors are contained here; per-tenant failures are isolated inside
// syncAllConfigs. Single-flight: a slow pass must not be overlapped by the next tick.
let configSyncRunning = false;
async function syncTenantConfigs(): Promise<void> {
  if (configSyncRunning) return;
  configSyncRunning = true;
  try {
    const tenants = await TenantService.getActiveTenants();
    await ConfigService.syncAllConfigs(tenants);
  } catch (e) {
    console.error('[Startup] config sync failed:', (e as Error).message);
  } finally {
    configSyncRunning = false;
  }
}

// Say once, at boot, what state the internal shared secret is in. Without this the two
// misconfigurations are indistinguishable in production: both simply reject every call,
// one because the operator meant to disable card activation and one because the value
// they chose is too weak to accept.
if (!process.env.HOSTING_INTERNAL_SECRET) {
  console.log('[Startup] HOSTING_INTERNAL_SECRET is not set; /v1/internal is disabled');
} else if (!internalSecret()) {
  console.error(
    `[Startup] HOSTING_INTERNAL_SECRET is shorter than ${MIN_INTERNAL_SECRET_LENGTH} characters` +
      ' and will be refused; /v1/internal is disabled until it is replaced'
  );
}

// Warm request-critical state BEFORE accepting traffic, bounded so a slow or down DB
// cannot block startup (health checks would loop the container):
//  - the verified custom-domain CORS set, so a restart can't deny valid origins
//  - regenerated tenant config files, so config-shape changes (e.g. the injected managed
//    flag) are in place before a custom-domain visitor loads one and caches a session
//    without the editor's Save.
// If the deadline wins, the in-flight sync still completes in the background and the
// periodic config sync below retries any tenant that failed.
await Promise.race([
  (async () => {
    await refreshVerifiedDomainOrigins();
    await syncTenantConfigs();
  })(),
  new Promise((resolve) => setTimeout(resolve, 5000)),
]);

// For node environments
if (typeof (globalThis as any).Bun === 'undefined') {
  const { serve } = await import('@hono/node-server');
  serve({ fetch: app.fetch, port });
  console.log(`Ecency Hosting API running on http://localhost:${port}`);
}

// Keep the verified custom-domain CORS set fresh.
startVerifiedDomainRefresh();

// Retry loop for served config files: a tenant whose write failed (or was cut off by the
// startup deadline) converges within a few minutes; identical files are not rewritten.
const configSyncTimer = setInterval(() => void syncTenantConfigs(), 5 * 60 * 1000);
configSyncTimer.unref?.();

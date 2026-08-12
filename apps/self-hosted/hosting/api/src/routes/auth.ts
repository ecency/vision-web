/**
 * Auth Routes
 *
 * Handles Hive-based authentication for the hosting API
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { callRPC, config as hiveTxConfig } from '@ecency/sdk/hive';
import { TenantService } from '../services/tenant-service';
import { nanoid } from 'nanoid';
import {
  createToken,
  verifyChallengeSignature,
  verifyToken,
  getTokenExpiry,
} from '../utils/auth';
import { challengeStore, handoffStore } from '../utils/redis';
import { AuditService, parseClientIp } from '../services/audit-service';

export const authRoutes = new Hono();

// Configure hive-tx nodes
hiveTxConfig.nodes = process.env.HIVE_API_URL?.split(',') || ['https://api.hive.blog'];

// Validation schemas
const loginChallengeSchema = z.object({
  username: z.string().min(3).max(16),
});

const loginVerifySchema = z.object({
  username: z.string().min(3).max(16),
  signature: z.string(),
  challenge: z.string(),
});

// POST /v1/auth/challenge - Get login challenge
authRoutes.post(
  '/challenge',
  zValidator('json', loginChallengeSchema),
  async (c) => {
    const { username } = c.req.valid('json');

    // Verify Hive account exists
    const accounts = await callRPC('condenser_api.get_accounts', [[username]]) as any[];
    if (!accounts || accounts.length === 0) {
      return c.json({ error: 'Hive account not found' }, 404);
    }

    // Generate challenge
    const challenge = `ecency-hosting-login:${username}:${Date.now()}:${nanoid(16)}`;
    const ttlSeconds = 5 * 60; // 5 minutes
    const expiresAt = Date.now() + ttlSeconds * 1000;

    // Store challenge in Redis
    await challengeStore.set(username, challenge, ttlSeconds);

    return c.json({
      username,
      challenge,
      expiresAt: new Date(expiresAt).toISOString(),
      instructions:
        'Sign this challenge with your Hive posting key using Keychain or HiveSigner',
    });
  }
);

// POST /v1/auth/verify - Verify signed challenge and issue token
authRoutes.post(
  '/verify',
  zValidator('json', loginVerifySchema),
  async (c) => {
    const { username, signature, challenge } = c.req.valid('json');

    // Check challenge exists and not expired (from Redis)
    const storedChallenge = await challengeStore.get(username);
    if (!storedChallenge || storedChallenge.challenge !== challenge) {
      return c.json({ error: 'Invalid or expired challenge' }, 400);
    }

    if (storedChallenge.expiresAt < Date.now()) {
      await challengeStore.delete(username);
      return c.json({ error: 'Challenge expired' }, 400);
    }

    // Get account public keys
    const accounts = await callRPC('condenser_api.get_accounts', [[username]]) as any[];
    if (!accounts || accounts.length === 0) {
      return c.json({ error: 'Account not found' }, 404);
    }

    const account = accounts[0];

    // Verify the signature against EVERY posting key on the account, not just the first:
    // accounts often carry several posting key_auths and the signer may hold any of them.
    // The full posting authority is passed so key weights are checked against the
    // threshold (a partial-authority key on a multisig account must not log in).
    if (!verifyChallengeSignature(account.posting, challenge, signature)) {
      return c.json({ error: 'Invalid signature' }, 401);
    }

    // Clean up challenge from Redis
    await challengeStore.delete(username);

    // Generate proper JWT token using shared utility
    const expiresInMs = 24 * 60 * 60 * 1000; // 24 hours
    const token = createToken(username, expiresInMs);
    const expiresAt = getTokenExpiry(token);

    void AuditService.log({
      eventType: 'auth.login',
      eventData: { username },
      ipAddress: parseClientIp(c.req.header('x-forwarded-for')),
      userAgent: c.req.header('user-agent'),
    });

    return c.json({
      token,
      username,
      expiresAt: expiresAt?.toISOString(),
    });
  }
);

// POST /v1/auth/hivesigner - Exchange a HiveSigner access token for a hosting token.
// HiveSigner sessions cannot sign an arbitrary challenge in the browser, so identity is
// established by asking HiveSigner itself (same pattern the web app uses server-side).
const hivesignerLoginSchema = z.object({
  accessToken: z.string().min(16).max(4096),
});

/**
 * Who a HiveSigner access token belongs to, asked from HiveSigner itself.
 * Shared by the login exchange and the handoff mint: identity is never taken
 * from the caller, only from the token.
 */
async function resolveHivesignerUsername(
  accessToken: string,
): Promise<
  | { ok: true; username: string }
  | { ok: false; status: 401 | 503; error: string }
> {
  let res: Response;
  try {
    res = await fetch('https://hivesigner.com/api/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, status: 503, error: 'Auth service unavailable' };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, status: 401, error: 'Invalid or expired HiveSigner token' };
  }
  if (!res.ok) {
    return { ok: false, status: 503, error: 'Auth service unavailable' };
  }

  let username: unknown;
  try {
    const data = (await res.json()) as any;
    username = data?.account?.name ?? data?.user;
  } catch {
    return { ok: false, status: 503, error: 'Auth service unavailable' };
  }

  if (typeof username !== 'string' || !/^[a-z][a-z0-9.-]{2,15}$/.test(username)) {
    return { ok: false, status: 401, error: 'Invalid or expired HiveSigner token' };
  }

  return { ok: true, username };
}

authRoutes.post(
  '/hivesigner',
  zValidator('json', hivesignerLoginSchema),
  async (c) => {
    const { accessToken } = c.req.valid('json');

    const resolved = await resolveHivesignerUsername(accessToken);
    if (!resolved.ok) {
      return c.json({ error: resolved.error }, resolved.status);
    }
    const { username } = resolved;

    const expiresInMs = 24 * 60 * 60 * 1000; // 24 hours
    const token = createToken(username, expiresInMs);
    const expiresAt = getTokenExpiry(token);

    void AuditService.log({
      eventType: 'auth.login',
      eventData: { username, method: 'hivesigner' },
      ipAddress: parseClientIp(c.req.header('x-forwarded-for')),
      userAgent: c.req.header('user-agent'),
    });

    return c.json({
      token,
      username,
      expiresAt: expiresAt?.toISOString(),
    });
  }
);

// POST /v1/auth/handoff - Mint a one-time short-TTL handoff code for the
// signup session carry-over. The success screen used to put the bearer itself
// in the Customize link's fragment; a captured link then stayed a live
// credential until upstream expiry. A code is worthless after one exchange or
// five minutes, whichever comes first. Identity comes from the token, never
// the caller, exactly like the login exchange above.
const HANDOFF_TTL_SECONDS = 5 * 60;

authRoutes.post(
  '/handoff',
  zValidator('json', hivesignerLoginSchema),
  async (c) => {
    const { accessToken } = c.req.valid('json');

    const resolved = await resolveHivesignerUsername(accessToken);
    if (!resolved.ok) {
      return c.json({ error: resolved.error }, resolved.status);
    }
    const { username } = resolved;

    const code = nanoid(32);
    await handoffStore.set(code, { accessToken, username }, HANDOFF_TTL_SECONDS);

    // The code (a capability) and the token never reach the audit trail.
    void AuditService.log({
      eventType: 'auth.handoff_minted',
      eventData: { username },
      ipAddress: parseClientIp(c.req.header('x-forwarded-for')),
      userAgent: c.req.header('user-agent'),
    });

    return c.json({
      code,
      username,
      expiresAt: new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000).toISOString(),
    });
  },
);

// POST /v1/auth/handoff/exchange - Trade the code for the carried session,
// exactly once: the read deletes. The instance still applies its own owner
// gate to whatever comes back; this endpoint only shortens how long anything
// secret exists inside a URL.
const handoffExchangeSchema = z.object({
  code: z.string().min(16).max(128),
});

authRoutes.post(
  '/handoff/exchange',
  zValidator('json', handoffExchangeSchema),
  async (c) => {
    const { code } = c.req.valid('json');

    const payload = await handoffStore.consume(code);
    if (!payload) {
      return c.json({ error: 'Invalid or expired handoff code' }, 404);
    }

    void AuditService.log({
      eventType: 'auth.handoff_exchanged',
      eventData: { username: payload.username },
      ipAddress: parseClientIp(c.req.header('x-forwarded-for')),
      userAgent: c.req.header('user-agent'),
    });

    return c.json({
      accessToken: payload.accessToken,
      username: payload.username,
    });
  },
);

// GET /v1/auth/me - Get current user info
authRoutes.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const token = authHeader.slice(7);
  const user = verifyToken(token);

  if (!user) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  // Get tenant info
  const tenant = await TenantService.getByUsername(user.username);

  return c.json({
    username: user.username,
    hasTenant: !!tenant,
    tenant: tenant
      ? {
          subscriptionStatus: tenant.subscriptionStatus,
          subscriptionPlan: tenant.subscriptionPlan,
          subscriptionExpiresAt: tenant.subscriptionExpiresAt,
          blogUrl: TenantService.getBlogUrl(tenant),
        }
      : null,
  });
});

// GET /v1/auth/tenant-lookup - Traefik middleware for custom domain routing
authRoutes.get('/tenant-lookup', async (c) => {
  const host = c.req.header('X-Forwarded-Host') || c.req.header('Host');

  if (!host) {
    return c.json({ error: 'No host header' }, 400);
  }

  // Check if it's a subdomain of our base domain
  const baseDomain = process.env.BASE_DOMAIN || 'blogs.ecency.com';
  if (host.endsWith('.' + baseDomain)) {
    const subdomain = host.replace('.' + baseDomain, '');
    c.header('X-Tenant-Id', subdomain);
    return c.json({ tenantId: subdomain });
  }

  // Check custom domain
  const tenant = await TenantService.getByDomain(host);
  if (tenant) {
    c.header('X-Tenant-Id', tenant.username);
    return c.json({ tenantId: tenant.username });
  }

  return c.json({ error: 'Unknown domain' }, 404);
});

export default authRoutes;

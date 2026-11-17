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
import { HIVESIGNER_APP_ACCOUNT } from '../services/hivesigner-registry';

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
/** Where a login challenge is stored: per challenge, not per account. */
function challengeKey(username: string, nonce: string): string {
  return `${username.toLowerCase()}:${nonce}`;
}

/**
 * The nonce of a challenge issued to `username`
 * (`ecency-hosting-login:<username>:<time>:<nonce>`), or null when it was not.
 */
function challengeNonce(challenge: string, username: string): string | null {
  const parts = challenge.split(':');
  if (parts.length !== 4 || parts[0] !== 'ecency-hosting-login') return null;
  if (parts[1].toLowerCase() !== username.toLowerCase()) return null;
  return /^[A-Za-z0-9_-]{16}$/.test(parts[3]) ? parts[3] : null;
}

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
    const nonce = nanoid(16);
    const challenge = `ecency-hosting-login:${username}:${Date.now()}:${nonce}`;
    const ttlSeconds = 5 * 60; // 5 minutes
    const expiresAt = Date.now() + ttlSeconds * 1000;

    // Each challenge has its own key, so issuing another for the same account
    // never voids one that is still being signed.
    await challengeStore.set(challengeKey(username, nonce), challenge, ttlSeconds);

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

    // The challenge names the account it was issued to and the key it is
    // stored under; one for another account is not looked up at all.
    const nonce = challengeNonce(challenge, username);
    const key = nonce ? challengeKey(username, nonce) : null;
    const storedChallenge = key ? await challengeStore.get(key) : null;
    if (!key || !storedChallenge || storedChallenge.challenge !== challenge) {
      return c.json({ error: 'Invalid or expired challenge' }, 400);
    }

    if (storedChallenge.expiresAt < Date.now()) {
      await challengeStore.delete(key);
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

    // Clean up challenge from Redis (a challenge is good for one login)
    await challengeStore.delete(key);

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
  // HiveSigner's /api/me accepts any valid token, whatever app it was issued
  // to and whatever kind. A hosting login takes only an access token issued
  // to this app, for one account.
  const author = ecencyAccessTokenAuthor(accessToken);
  if (!author) {
    return { ok: false, status: 401, error: 'Invalid or expired HiveSigner token' };
  }

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

  if (
    typeof username !== 'string' ||
    !/^[a-z][a-z0-9.-]{2,15}$/.test(username) ||
    username !== author
  ) {
    return { ok: false, status: 401, error: 'Invalid or expired HiveSigner token' };
  }

  return { ok: true, username };
}

/**
 * The account an access token issued to this app names, or null for anything
 * else: another app's token, a code, a refresh token, or not a token.
 */
function ecencyAccessTokenAuthor(token: string): string | null {
  try {
    const json = Buffer.from(
      token.replace(/-/g, '+').replace(/_/g, '/').replace(/\./g, '='),
      'base64',
    ).toString('utf8');
    const message = JSON.parse(json);
    const authors = message?.authors;
    if (
      message?.signed_message?.type !== 'posting' ||
      message.signed_message.app !== HIVESIGNER_APP_ACCOUNT ||
      !Array.isArray(authors) ||
      authors.length !== 1 ||
      typeof authors[0] !== 'string'
    ) {
      return null;
    }
    return authors[0];
  } catch {
    return null;
  }
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

    // Per-account cap beside the per-IP limits: a leaked token must not
    // become an unbounded code mill, and legitimate use is one code per
    // success screen plus a slow refresh.
    const mintCount = await handoffStore.countMint(username);
    if (mintCount > 10) {
      return c.json({ error: 'Too many handoff requests' }, 429);
    }

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

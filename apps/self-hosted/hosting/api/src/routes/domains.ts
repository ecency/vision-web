/**
 * Domain Management Routes
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { DomainInUseError, TenantService } from '../services/tenant-service';
import type { Tenant } from '../types';
import { DomainService } from '../services/domain-service';
import { customDomainCapability } from '../services/subscription';
import { authMiddleware } from '../middleware/auth';
import { AuditService, parseClientIp } from '../services/audit-service';
import { addVerifiedDomainOrigin } from '../utils/cors-domains';

/** Hive account names, the same shape the internal rail validates. */
const HIVE_USERNAME = /^[a-z][a-z0-9.-]{2,15}$/;

export const domainRoutes = new Hono();

/**
 * Resolves the tenant a domain request is about.
 *
 * A community tenant is stored as username 'hive-NNNN' with a separate owner,
 * so resolving by the caller's own name could only ever reach a personal blog
 * and a community owner got 404 for the domain their Pro plan paid for. The
 * target is explicit, and authorisation stays on tenant.owner.
 */
type OwnedTenant =
  | { tenant: Tenant; actor: string; response: null }
  | { tenant: null; actor: null; response: Response };

async function resolveOwnedTenant(c: Context): Promise<OwnedTenant> {
  const authUser = c.get('user');
  const requested = (c.req.query('tenant') || '').trim().toLowerCase();

  // Shape-checked before it reaches the database, matching every sibling path.
  // Authorisation keys on tenant.owner rather than on this value, so it is not
  // a bypass, but an unbounded free-text lookup is not worth leaving open.
  if (requested && !HIVE_USERNAME.test(requested)) {
    return { tenant: null, actor: null, response: c.json({ error: 'Invalid tenant' }, 400) };
  }

  const tenant = await TenantService.getByUsername(requested || authUser.username);
  if (!tenant) {
    return { tenant: null, actor: null, response: c.json({ error: 'Tenant not found' }, 404) };
  }
  if (authUser.username !== tenant.owner) {
    return { tenant: null, actor: null, response: c.json({ error: 'Unauthorized' }, 403) };
  }

  return { tenant, actor: authUser.username, response: null };
}

/**
 * Refuse a custom-domain capability the tenant is no longer paying for.
 *
 * The plan alone is not enough: expiry never clears subscription_plan, so a lapsed tenant kept
 * 'pro' and with it the ability to attach and verify domains. A tenant inside the grace window
 * is still allowed, so a renewal in progress is never blocked. Returns null when allowed.
 */
function refuseIfNotEntitled(c: Context, tenant: Tenant): Response | null {
  const capability = customDomainCapability(tenant);
  if (capability.allowed) return null;

  if (capability.state === 'none') {
    return c.json({ error: 'Custom domains require Pro plan' }, 402);
  }
  return c.json(
    {
      error: 'Custom domains require an active subscription',
      subscriptionStatus: tenant.subscriptionStatus,
      customDomainCapability: capability.state,
    },
    402
  );
}

// Validation schemas
const addDomainSchema = z.object({
  domain: z.string()
    .min(4)
    .max(255)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i, 'Invalid domain format'),
});

// POST /v1/domains - Add custom domain to tenant
domainRoutes.post('/', authMiddleware, zValidator('json', addDomainSchema), async (c) => {
  const { domain } = c.req.valid('json');
  const { tenant, actor, response } = await resolveOwnedTenant(c);
  if (!tenant) return response;
  const username = tenant.username;

  // Pro plan AND a subscription that is paid for (or inside the grace window after expiry).
  const refusal = refuseIfNotEntitled(c, tenant);
  if (refusal) return refusal;

  // Occupancy covers unverified reservations too: the column is UNIQUE either
  // way, so an unverified row still blocks everyone else.
  if (await TenantService.isDomainClaimed(domain, username)) {
    return c.json({ error: 'Domain already in use' }, 409);
  }

  // Set domain and generate verification
  let updated: Awaited<ReturnType<typeof TenantService.setCustomDomain>>;
  try {
    updated = await TenantService.setCustomDomain(username, domain);
  } catch (error) {
    if (error instanceof DomainInUseError) {
      return c.json({ error: 'Domain already in use' }, 409);
    }
    throw error;
  }
  // The statement preserves the flag only when the domain was unchanged, so a
  // still-verified row here means this was a repeat submit of a live domain.
  // Re-issuing the verification would delete its record and the origin sync
  // would drop the vhost and certificate.
  if (updated.customDomainVerified) {
    return c.json({ domain, verified: true, message: 'Domain already verified' });
  }

  // Recorded as soon as the tenant row changes, before the verification record
  // it does not depend on, matching internal.ts: setCustomDomain also clears
  // custom_domain_verified, so a throw from createVerification would otherwise
  // leave the domain state changed with nothing in the trail to say what did it.
  void AuditService.log({
    tenantId: tenant.id,
    eventType: 'domain.added',
    eventData: { domain, username, actor },
    ipAddress: parseClientIp(c.req.header('x-forwarded-for')),
    userAgent: c.req.header('user-agent'),
  });

  const verification = await DomainService.createVerification(username, domain);

  // The record NAME must be the domain itself: verification resolves the domain's CNAME
  // (and serving requires it too). The internal verification token is bookkeeping only.
  return c.json({
    domain,
    verification: {
      method: verification.verificationMethod,
      type: 'CNAME',
      name: domain,
      value: username + '.' + (process.env.BASE_DOMAIN || 'blogs.ecency.com'),
      instructions: `Add a CNAME record pointing ${domain} to ${username}.${process.env.BASE_DOMAIN || 'blogs.ecency.com'}`,
      expiresAt: verification.expiresAt,
    },
  }, 201);
});

// POST /v1/domains/verify - Verify domain ownership
domainRoutes.post('/verify', authMiddleware, async (c) => {
  const { tenant, actor, response } = await resolveOwnedTenant(c);
  if (!tenant) return response;
  const username = tenant.username;

  // Verification had no plan or status gate at all, so a lapsed tenant could still turn an
  // unverified claim into a verified one, which is what puts the domain into the served set and
  // the first-party CORS allowlist.
  const refusal = refuseIfNotEntitled(c, tenant);
  if (refusal) return refusal;

  if (!tenant.customDomain) {
    return c.json({ error: 'No custom domain configured' }, 400);
  }

  // Captured before the DNS round trip so the result is applied to the domain
  // that was actually checked.
  const checkedDomain = tenant.customDomain;

  // Check DNS
  const isVerified = await DomainService.verifyDomain(checkedDomain, username);

  if (!isVerified) {
    return c.json({
      verified: false,
      domain: checkedDomain,
      message: 'DNS verification failed. Please check your CNAME record.',
    });
  }

  // Mark as verified. Null means the tenant's domain changed while DNS was
  // being checked, so this result no longer describes the stored domain.
  const verifiedTenant = await TenantService.verifyCustomDomain(username, checkedDomain);
  if (!verifiedTenant) {
    return c.json({
      verified: false,
      domain: checkedDomain,
      message: 'The custom domain changed during verification. Please verify again.',
    });
  }

  await DomainService.markVerified(username, checkedDomain);
  addVerifiedDomainOrigin(checkedDomain);

  void AuditService.log({
    tenantId: tenant.id,
    eventType: 'domain.verified',
    eventData: { domain: checkedDomain, username, actor },
    ipAddress: parseClientIp(c.req.header('x-forwarded-for')),
    userAgent: c.req.header('user-agent'),
  });

  return c.json({
    verified: true,
    domain: checkedDomain,
    message: 'Domain verified successfully!',
  });
});

// DELETE /v1/domains - Remove custom domain
domainRoutes.delete('/', authMiddleware, async (c) => {
  try {
    const { tenant, actor, response } = await resolveOwnedTenant(c);
    if (!tenant) return response;
    const username = tenant.username;

    await TenantService.removeCustomDomain(username);

    void AuditService.log({
      tenantId: tenant?.id ?? null,
      eventType: 'domain.removed',
      eventData: { username, actor },
      ipAddress: parseClientIp(c.req.header('x-forwarded-for')),
      userAgent: c.req.header('user-agent'),
    });

    return c.json({ message: 'Custom domain removed' });
  } catch (error: any) {
    if (error.message === 'Tenant not found') {
      return c.json({ error: 'Tenant not found' }, 404);
    }
    console.error('[Domains] Error removing custom domain:', error);
    return c.json({ error: 'Failed to remove custom domain' }, 500);
  }
});

// GET /v1/domains/check/:domain - Check domain availability
domainRoutes.get('/check/:domain', async (c) => {
  const domain = c.req.param('domain');

  // Availability has to answer the same question POST / enforces. Asking the
  // verified-only lookup reported a domain another tenant had reserved but not
  // verified as free, right up until the add call refused it with a conflict.
  const claimed = await TenantService.isDomainClaimed(domain);
  // registeredTo stays on the verified lookup: an unverified reservation is
  // unproven, so naming its holder to an unauthenticated caller would disclose
  // a claim nobody has demonstrated.
  const verifiedHolder = claimed ? await TenantService.getByDomain(domain) : null;

  return c.json({
    domain,
    available: !claimed,
    registeredTo: verifiedHolder ? verifiedHolder.username : null,
  });
});

export default domainRoutes;

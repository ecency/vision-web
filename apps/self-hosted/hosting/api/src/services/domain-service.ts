/**
 * Domain Service
 *
 * Handles custom domain verification
 */

import { promises as dns } from 'dns';
import { db, type SqlExecutor } from '../db/client';
import { nanoid } from 'nanoid';
import { TenantService } from './tenant-service';
import {
  type DomainVerification,
  type DomainVerificationRow,
  type Tenant,
  mapDomainVerificationFromDb,
} from '../types';

const baseDomain = process.env.BASE_DOMAIN || 'blogs.ecency.com';

/** Days the instructions give for pointing DNS at us. Bookkeeping: nothing enforces it. */
const VERIFICATION_WINDOW_DAYS = 7;

/**
 * Give the tenant a verification record for the domain it now holds.
 *
 * Records for domains it no longer holds are dropped, but a record for THIS domain is kept as
 * it stands. Its created_at is what the release sweep dates the claim by, so replacing it on
 * every submit let a holder restart the claim clock indefinitely by re-posting the same domain.
 * Keeping the earliest record means the window runs from the first time the domain was asked
 * for, which is the honest reading of "how long has this claim been unverified".
 *
 * Runs on the caller's executor so it commits with the claim, never separately.
 */
async function issueVerification(
  exec: SqlExecutor,
  tenantId: string,
  domain: string
): Promise<DomainVerification> {
  const normalized = domain.toLowerCase();

  await exec.query(
    'DELETE FROM domain_verifications WHERE tenant_id = $1 AND domain <> $2',
    [tenantId, normalized]
  );

  const existing = await exec.query<DomainVerificationRow>(
    `SELECT * FROM domain_verifications
      WHERE tenant_id = $1 AND domain = $2
      ORDER BY created_at ASC
      LIMIT 1`,
    [tenantId, normalized]
  );
  if (existing.rows[0]) return mapDomainVerificationFromDb(existing.rows[0]);

  const token = '_ecency-verify.' + nanoid(16);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + VERIFICATION_WINDOW_DAYS);

  const created = await exec.query<DomainVerificationRow>(
    `INSERT INTO domain_verifications
     (tenant_id, domain, verification_token, verification_method, expires_at)
     VALUES ($1, $2, $3, 'cname', $4)
     RETURNING *`,
    [tenantId, normalized, token, expiresAt]
  );

  return mapDomainVerificationFromDb(created.rows[0]);
}

/** Outcome of an attach. A null verification means the domain was already verified. */
export interface DomainAttachment {
  tenant: Tenant;
  verification: DomainVerification | null;
}

export const DomainService = {
  /**
   * Attach a custom domain to a tenant, claim and verification record together.
   *
   * ONE transaction, and the only way either rail attaches a domain. Split across two commits,
   * as this was, there were windows in which a tenant held a domain with no record backing it:
   * the release sweep dates a claim by that record, so a sweep landing in one of them cleared a
   * claim seconds old, and a failed insert left the tenant holding a domain whose previous
   * record had already been deleted. Neither state exists now: the claim and the record commit
   * together or not at all.
   *
   * Re-submitting a domain the tenant already holds VERIFIED returns verification null and
   * leaves everything alone. Re-issuing it would delete the live record, and the origin sync
   * would drop the vhost and certificate with it. Whether the domain was unchanged is decided
   * inside the UPDATE rather than from an earlier read, which a concurrent update could stale.
   *
   * Throws DomainInUseError if another tenant holds the domain, and 'Tenant not found' if the
   * username matches no row.
   */
  async attachDomain(username: string, domain: string): Promise<DomainAttachment> {
    return db.transaction(async (client) => {
      const tenant = await TenantService.setCustomDomain(client, username, domain);
      if (tenant.customDomainVerified) return { tenant, verification: null };

      const verification = await issueVerification(client, tenant.id, domain);
      return { tenant, verification };
    });
  },

  /**
   * Verify domain via DNS lookup
   * Only accepts exact CNAME match to the tenant's subdomain to prevent
   * domains pointed to other tenants from being validated.
   */
  async verifyDomain(domain: string, username: string): Promise<boolean> {
    const expectedTarget = (username + '.' + baseDomain).toLowerCase();

    try {
      // Check CNAME record
      const records = await dns.resolveCname(domain);

      for (const record of records) {
        const normalizedRecord = record.toLowerCase();
        // Strip trailing dot if present (some DNS servers include it)
        const cleanRecord = normalizedRecord.endsWith('.')
          ? normalizedRecord.slice(0, -1)
          : normalizedRecord;

        // ONLY accept exact match to this tenant's subdomain
        // Do NOT accept any other subdomain - that would allow hijacking
        if (cleanRecord === expectedTarget) {
          return true;
        }
      }

      return false;
    } catch (err: any) {
      // ENODATA means no CNAME record
      // ENOTFOUND means domain doesn't exist
      console.log('[DomainService] DNS lookup failed for', domain, err.code);
      return false;
    }
  },

  /**
   * Mark domain as verified
   */
  async markVerified(username: string, domain: string): Promise<void> {
    const tenant = await db.queryOne<{ id: string }>(
      'SELECT id FROM tenants WHERE username = $1',
      [username]
    );

    if (!tenant) return;

    await db.query(
      `UPDATE domain_verifications
       SET verified = true, verified_at = NOW()
       WHERE tenant_id = $1 AND domain = $2`,
      [tenant.id, domain.toLowerCase()]
    );
  },
};

// getExpiredVerifications and cleanupExpiredVerifications were here, wired to nothing since they
// were written. They are deleted rather than wired up: a record's expires_at is bookkeeping shown
// in the DNS instructions, while the record itself now DATES the claim for the release sweep, so
// deleting records on that expiry would hand the sweep a claim with no date and free a domain
// early. Stale records are removed with the claim they belong to, by releaseUnverifiedDomains and
// by removeCustomDomain.

export default DomainService;

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ queryAll: vi.fn() }));

vi.mock('../db/client', () => ({ db: { queryAll: mocks.queryAll } }));

const { refreshVerifiedDomainOrigins, isVerifiedDomainOrigin, addVerifiedDomainOrigin } =
  await import('./cors-domains');
const { PRO_GRACE_DAYS } = await import('../services/subscription');

beforeEach(() => {
  mocks.queryAll.mockReset().mockResolvedValue([]);
});

/**
 * A verified custom domain is a first-party origin: the SPA on it saves configuration and
 * exchanges auth against this API. The query had no standing filter, so a tenant that stopped
 * paying kept that privilege indefinitely.
 */
describe('verified custom-domain CORS origins', () => {
  it('selects only Pro tenants in good standing, including the grace window', async () => {
    await refreshVerifiedDomainOrigins();

    const [sql, params] = mocks.queryAll.mock.calls[0];
    const normalised = sql.replace(/\s+/g, ' ');
    expect(normalised).toContain('custom_domain_verified = true');
    expect(normalised).toContain("subscription_plan = 'pro'");
    expect(normalised).toContain("subscription_status = 'active'");
    expect(normalised).toContain("subscription_status = 'expired'");
    expect(normalised).toContain("subscription_expires_at > NOW() - ($1 * INTERVAL '1 day')");
    expect(params).toEqual([PRO_GRACE_DAYS]);
  });

  it('loads the origins the query returns', async () => {
    mocks.queryAll.mockResolvedValue([{ custom_domain: 'Mine.Example.Test' }]);

    await refreshVerifiedDomainOrigins();

    expect(isVerifiedDomainOrigin('https://mine.example.test')).toBe(true);
  });

  it('keeps the previous set when the database is unavailable', async () => {
    // A transient failure must not deny origins that are perfectly valid.
    addVerifiedDomainOrigin('kept.example.test');
    mocks.queryAll.mockRejectedValue(new Error('connection refused'));

    await refreshVerifiedDomainOrigins();

    expect(isVerifiedDomainOrigin('https://kept.example.test')).toBe(true);
  });
});

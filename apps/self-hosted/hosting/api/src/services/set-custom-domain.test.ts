import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ queryOne: vi.fn() }));

vi.mock('../db/client', () => ({ db: { queryOne: mocks.queryOne } }));
vi.mock('@ecency/sdk/hive', () => ({ callRPC: vi.fn(), config: { set: vi.fn() } }));

const { TenantService, DomainInUseError } = await import('./tenant-service');

/**
 * Whether a re-submitted domain keeps its verification is decided inside the
 * UPDATE, not by the route, because a route-level guard would be check-then-act
 * on a read that a concurrent update can invalidate. There is no database in
 * this suite, so the statement is pinned here directly: if the conditional ever
 * turns back into an unconditional reset, a live blog loses its vhost and
 * certificate on a harmless repeat submit.
 */
describe('setCustomDomain', () => {
  beforeEach(() => {
    mocks.queryOne.mockReset().mockResolvedValue({ id: 't1', username: 'alice' });
  });

  it('preserves verification only when the stored domain is unchanged', async () => {
    await TenantService.setCustomDomain('alice', 'mine.example.com');

    const [sql, params] = mocks.queryOne.mock.calls[0];
    const normalised = sql.replace(/\s+/g, ' ');

    expect(normalised).toContain(
      'custom_domain_verified = CASE WHEN custom_domain = $2 THEN custom_domain_verified ELSE false END',
    );
    expect(normalised).toContain(
      'custom_domain_verified_at = CASE WHEN custom_domain = $2 THEN custom_domain_verified_at ELSE NULL END',
    );
    expect(params).toEqual(['alice', 'mine.example.com']);
  });

  it('lowercases both the tenant and the domain', async () => {
    await TenantService.setCustomDomain('Alice', 'Mine.Example.COM');

    expect(mocks.queryOne.mock.calls[0][1]).toEqual(['alice', 'mine.example.com']);
  });

  it('reports a unique violation as a domain conflict', async () => {
    mocks.queryOne.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));

    await expect(
      TenantService.setCustomDomain('alice', 'taken.example.com'),
    ).rejects.toBeInstanceOf(DomainInUseError);
  });

  it('does not swallow an unrelated database error', async () => {
    mocks.queryOne.mockRejectedValue(Object.assign(new Error('boom'), { code: '08006' }));

    await expect(
      TenantService.setCustomDomain('alice', 'x.example.com'),
    ).rejects.toThrow('boom');
  });

  it('reports a missing tenant', async () => {
    mocks.queryOne.mockResolvedValue(null);

    await expect(
      TenantService.setCustomDomain('nobody', 'x.example.com'),
    ).rejects.toThrow('Tenant not found');
  });
});

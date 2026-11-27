import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../db/client', () => ({ db: { query: mocks.query } }));
vi.mock('@ecency/sdk/hive', () => ({ callRPC: vi.fn(), config: { set: vi.fn() } }));

const { TenantService, DomainInUseError } = await import('./tenant-service');

// The claim runs on whatever executor the attach hands it, so the test supplies one directly.
const exec = { query: (sql: string, params?: any[]) => mocks.query(sql, params) };

/**
 * Whether a re-submitted domain keeps its verification is decided inside the
 * UPDATE, not by the route, because a route-level guard would be check-then-act
 * on a read that a concurrent update can invalidate. That behaviour is pinned
 * against real Postgres in tenant-custom-domain.pg.test.ts: matching the SQL
 * text here once passed a statement Postgres refused to plan. This suite keeps
 * the parts that need no database (parameters, error mapping).
 */
describe('setCustomDomain', () => {
  beforeEach(() => {
    mocks.query.mockReset().mockResolvedValue({ rows: [{ id: 't1', username: 'alice' }] });
  });

  it('lowercases both the tenant and the domain', async () => {
    await TenantService.setCustomDomain(exec, 'Alice', 'Mine.Example.COM');

    expect(mocks.query.mock.calls[0][1]).toEqual(['alice', 'mine.example.com']);
  });

  it('reports a unique violation as a domain conflict', async () => {
    mocks.query.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));

    await expect(
      TenantService.setCustomDomain(exec, 'alice', 'taken.example.com'),
    ).rejects.toBeInstanceOf(DomainInUseError);
  });

  it('does not swallow an unrelated database error', async () => {
    mocks.query.mockRejectedValue(Object.assign(new Error('boom'), { code: '08006' }));

    await expect(
      TenantService.setCustomDomain(exec, 'alice', 'x.example.com'),
    ).rejects.toThrow('boom');
  });

  it('reports a missing tenant', async () => {
    mocks.query.mockResolvedValue({ rows: [] });

    await expect(
      TenantService.setCustomDomain(exec, 'nobody', 'x.example.com'),
    ).rejects.toThrow('Tenant not found');
  });

  /**
   * The claim must be able to share the attach transaction. If it reached for the module-level
   * db instead of the executor it was handed, it would commit on its own connection and the
   * claim would once again be able to exist without the verification record that dates it.
   */
  it('runs on the executor it was given, never on its own connection', async () => {
    const shared = { query: vi.fn().mockResolvedValue({ rows: [{ id: 't1' }] }) };

    await TenantService.setCustomDomain(shared, 'alice', 'mine.example.com');

    expect(shared.query).toHaveBeenCalledTimes(1);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

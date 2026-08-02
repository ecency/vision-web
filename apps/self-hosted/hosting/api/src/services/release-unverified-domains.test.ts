import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), queryOne: vi.fn() }));

vi.mock('../db/client', () => ({
  db: { transaction: mocks.transaction, queryOne: mocks.queryOne, query: vi.fn() },
}));
vi.mock('@ecency/sdk/hive', () => ({ callRPC: vi.fn(), config: { set: vi.fn() } }));

const { TenantService } = await import('./tenant-service');

/**
 * Records every statement the sweep runs, and models the one database behaviour that matters
 * here: once the claim is cleared, the domain is gone from the row. A read taken after the
 * UPDATE (or a RETURNING clause, which reports the new row) yields a null domain, so a sweep
 * that reports what it released has to capture it beforehand.
 */
function fakeTransaction(candidates: any[]) {
  const calls: { sql: string; params: any[] }[] = [];
  let cleared = false;
  mocks.transaction.mockImplementation(async (fn: (client: any) => Promise<any>) =>
    fn({
      query: async (sql: string, params: any[] = []) => {
        calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
        if (/UPDATE tenants/.test(sql)) {
          cleared = true;
          const rows = candidates.map((row) => ({ ...row, custom_domain: null }));
          return { rows: /RETURNING/.test(sql) ? rows : [], rowCount: candidates.length };
        }
        if (/^SELECT/.test(sql.trim())) {
          const rows = cleared
            ? candidates.map((row) => ({ ...row, custom_domain: null }))
            : candidates;
          return { rows, rowCount: rows.length };
        }
        return { rows: [], rowCount: 0 };
      },
    })
  );
  return calls;
}

const CLAIM = { id: 'tenant-1', username: 'alice', custom_domain: 'mine.example.test' };

beforeEach(() => {
  mocks.transaction.mockReset();
  mocks.queryOne.mockReset();
});

/**
 * A tenant could claim a custom domain, never verify it, and hold it forever: custom_domain is
 * UNIQUE whether or not it is verified, so the rightful owner was blocked with no way out.
 * Nothing expired the claim, and the 7-day verification record nothing acted on would not have
 * freed the column anyway.
 */
describe('TenantService.releaseUnverifiedDomains', () => {
  it('only ever selects unverified claims with no recent verification record', async () => {
    const calls = fakeTransaction([]);

    await TenantService.releaseUnverifiedDomains(14);

    const select = calls[0];
    expect(select.sql).toContain('custom_domain_verified = false');
    expect(select.sql).toContain('custom_domain IS NOT NULL');
    // The claim date comes from the verification record the attach path always writes, so no
    // schema change is needed and a claim made minutes ago is never swept.
    expect(select.sql).toContain('NOT EXISTS');
    expect(select.sql).toContain("dv.created_at > NOW() - ($1 * INTERVAL '1 day')");
    expect(select.params).toEqual([14]);
  });

  it('locks the candidates it is about to clear', async () => {
    // Without the lock a verification committing between the read and the write would have its
    // result thrown away, unbinding a domain that had just been proven.
    const calls = fakeTransaction([]);

    await TenantService.releaseUnverifiedDomains(14);

    expect(calls[0].sql).toContain('FOR UPDATE');
  });

  it('clears the whole claim so the domain is free for its rightful owner', async () => {
    const calls = fakeTransaction([CLAIM]);

    await TenantService.releaseUnverifiedDomains(14);

    const update = calls[1];
    expect(update.sql).toContain('UPDATE tenants');
    expect(update.sql).toContain('custom_domain = NULL');
    expect(update.sql).toContain('custom_domain_verified_at = NULL');
    expect(update.params).toEqual([['tenant-1']]);
  });

  it('reports the domain it released, read before the row was cleared', async () => {
    // RETURNING would report the NEW row, whose custom_domain is NULL by construction.
    fakeTransaction([CLAIM]);

    const released = await TenantService.releaseUnverifiedDomains(14);

    expect(released).toEqual([{ username: 'alice', domain: 'mine.example.test' }]);
  });

  it('deletes the stale verification records of the claims it released', async () => {
    const calls = fakeTransaction([CLAIM]);

    await TenantService.releaseUnverifiedDomains(14);

    const cleanup = calls[2];
    expect(cleanup.sql).toContain('DELETE FROM domain_verifications');
    expect(cleanup.sql).toContain('verified = false');
    expect(cleanup.params).toEqual([['tenant-1']]);
  });

  it('writes nothing when there is nothing to release', async () => {
    const calls = fakeTransaction([]);

    const released = await TenantService.releaseUnverifiedDomains(14);

    expect(released).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

/**
 * A verification can be in flight when a claim is released. Nothing coordinates the two beyond
 * the row lock, and nothing needs to: the write is keyed on the domain that was checked, so a
 * released claim matches no row and the caller is told to verify again rather than being handed
 * a verified flag for a domain the tenant no longer holds.
 */
describe('an in-flight verification cannot resurrect a released claim', () => {
  it('keys the verification write on both the tenant and the checked domain', async () => {
    mocks.queryOne.mockResolvedValue(null);

    const result = await TenantService.verifyCustomDomain('alice', 'mine.example.test');

    const [sql, params] = mocks.queryOne.mock.calls[0];
    expect(sql.replace(/\s+/g, ' ')).toContain('WHERE username = $1 AND custom_domain = $2');
    expect(params).toEqual(['alice', 'mine.example.test']);
    // No row matched (the claim was released mid-check), so the caller gets null.
    expect(result).toBeNull();
  });
});

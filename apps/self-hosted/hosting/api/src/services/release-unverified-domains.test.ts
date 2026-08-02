import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), queryOne: vi.fn() }));

vi.mock('../db/client', () => ({
  db: { transaction: mocks.transaction, queryOne: mocks.queryOne, query: vi.fn() },
}));
vi.mock('@ecency/sdk/hive', () => ({ callRPC: vi.fn(), config: { set: vi.fn() } }));

const { TenantService } = await import('./tenant-service');

/** Records every statement the sweep runs on its transaction client. */
function fakeTransaction(releasedRows: any[]) {
  const calls: { sql: string; params: any[] }[] = [];
  mocks.transaction.mockImplementation(async (fn: (client: any) => Promise<any>) =>
    fn({
      query: async (sql: string, params: any[] = []) => {
        calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
        if (/UPDATE tenants/.test(sql)) {
          return { rows: releasedRows, rowCount: releasedRows.length };
        }
        return { rows: [], rowCount: 0 };
      },
    })
  );
  return calls;
}

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
  it('only ever targets unverified claims with no recent verification record', async () => {
    const calls = fakeTransaction([]);

    await TenantService.releaseUnverifiedDomains(14);

    const update = calls[0];
    expect(update.sql).toContain('UPDATE tenants');
    expect(update.sql).toContain('custom_domain_verified = false');
    expect(update.sql).toContain('custom_domain IS NOT NULL');
    // The claim date comes from the verification record the attach path always writes, so no
    // schema change is needed and a claim made minutes ago is never swept.
    expect(update.sql).toContain('NOT EXISTS');
    expect(update.sql).toContain("dv.created_at > NOW() - ($1 * INTERVAL '1 day')");
    expect(update.params).toEqual([14]);
  });

  it('clears the whole claim so the domain is free for its rightful owner', async () => {
    const calls = fakeTransaction([]);

    await TenantService.releaseUnverifiedDomains(14);

    expect(calls[0].sql).toContain('custom_domain = NULL');
    expect(calls[0].sql).toContain('custom_domain_verified_at = NULL');
  });

  it('deletes the stale verification records of the claims it released', async () => {
    const calls = fakeTransaction([
      { id: 'tenant-1', username: 'alice', custom_domain: 'mine.example.test' },
    ]);

    const released = await TenantService.releaseUnverifiedDomains(14);

    expect(released).toEqual([{ username: 'alice', domain: 'mine.example.test' }]);
    const cleanup = calls[1];
    expect(cleanup.sql).toContain('DELETE FROM domain_verifications');
    expect(cleanup.sql).toContain('verified = false');
    expect(cleanup.params).toEqual([['tenant-1']]);
  });

  it('runs no cleanup when nothing was released', async () => {
    const calls = fakeTransaction([]);

    const released = await TenantService.releaseUnverifiedDomains(14);

    expect(released).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

/**
 * A verification can be in flight when a claim is released. Nothing coordinates the two, and
 * nothing needs to: the write is keyed on the domain that was checked, so a released claim
 * matches no row and the caller is told to verify again rather than being handed a verified
 * flag for a domain the tenant no longer holds.
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

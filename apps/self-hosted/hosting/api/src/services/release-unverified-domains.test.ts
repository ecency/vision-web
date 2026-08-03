import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), queryOne: vi.fn(), query: vi.fn() }));

vi.mock('../db/client', () => ({
  db: { transaction: mocks.transaction, queryOne: mocks.queryOne, query: mocks.query },
}));
vi.mock('@ecency/sdk/hive', () => ({ callRPC: vi.fn(), config: { set: vi.fn() } }));

const { TenantService } = await import('./tenant-service');

const DAY = 24 * 60 * 60 * 1000;
const CLAIM_DAYS = 14;

interface FakeTenant {
  id: string;
  username: string;
  custom_domain: string | null;
  custom_domain_verified: boolean;
  /** When the tenant row was last touched by anything at all, verification or not. */
  updated_at?: Date;
  /** created_at of the earliest verification record for the domain above; null when there is none. */
  record_created_at: Date | null;
}

/**
 * Records every statement the sweep runs and EVALUATES the predicates it asks for, so a sweep
 * that stops asking a question is handed the rows it should have withheld.
 *
 * Three database behaviours matter here:
 *
 * - Once the claim is cleared the domain is gone from the row, so a sweep that reports what it
 *   released has to capture it beforehand (RETURNING reports the new row, whose domain is null).
 * - The claim window is read off the SQL: a candidate whose verification record is newer than the
 *   window the statement asks for is withheld. A statement that drops the NOT EXISTS entirely
 *   protects nothing, which is what a released fresh claim would look like in production.
 * - Anything the statement says about updated_at is honoured too, so re-introducing a settle
 *   window on the tenant row shows up as a claim that stops being released.
 *
 * `onLock` runs between the candidate SELECT and the UPDATE, standing in for a transaction that
 * commits while the sweep waits for its row lock.
 */
function fakeSweep(candidates: FakeTenant[], onLock?: (rows: FakeTenant[]) => void) {
  const calls: { sql: string; params: any[] }[] = [];

  const norm = (sql: string) => sql.replace(/\s+/g, ' ').trim();

  const hasFreshRecord = (sql: string, params: any[], row: FakeTenant) => {
    const window = /dv\.created_at > NOW\(\) - \(\$(\d+) \* INTERVAL '1 day'\)/.exec(norm(sql));
    // No claim-window question in the statement means nothing is protected by one.
    if (!window) return false;
    const days = params[Number(window[1]) - 1];
    if (!row.record_created_at) return false;
    return row.record_created_at.getTime() > Date.now() - days * DAY;
  };

  const isSettling = (sql: string, params: any[], row: FakeTenant) => {
    const window = /updated_at < NOW\(\) - \(\$(\d+) \* INTERVAL '1 minute'\)/.exec(norm(sql));
    if (!window || !row.updated_at) return false;
    const minutes = params[Number(window[1]) - 1];
    return row.updated_at.getTime() > Date.now() - minutes * 60_000;
  };

  const releasable = (sql: string, params: any[], row: FakeTenant) =>
    row.custom_domain !== null &&
    row.custom_domain_verified === false &&
    !hasFreshRecord(sql, params, row) &&
    !isSettling(sql, params, row);

  mocks.transaction.mockImplementation(async (fn: (client: any) => Promise<any>) =>
    fn({
      query: async (sql: string, params: any[] = []) => {
        calls.push({ sql: norm(sql), params });

        if (/^SELECT/.test(sql.trim())) {
          const rows = candidates
            .filter((row) => releasable(sql, params, row))
            .map(({ id, username, custom_domain }) => ({ id, username, custom_domain }));
          onLock?.(candidates);
          return { rows, rowCount: rows.length };
        }

        if (/UPDATE tenants/.test(sql)) {
          const ids: string[] = params[0] ?? [];
          const matched = candidates.filter(
            (row) => ids.includes(row.id) && releasable(sql, params, row)
          );
          for (const row of matched) row.custom_domain = null;
          return {
            rows: /RETURNING/.test(sql) ? matched.map((row) => ({ id: row.id })) : [],
            rowCount: matched.length,
          };
        }

        return { rows: [], rowCount: 0 };
      },
    })
  );
  return calls;
}

function claim(over: Partial<FakeTenant> = {}): FakeTenant {
  return {
    id: 'tenant-1',
    username: 'alice',
    custom_domain: 'mine.example.test',
    custom_domain_verified: false,
    record_created_at: new Date(Date.now() - (CLAIM_DAYS + 1) * DAY),
    ...over,
  };
}

beforeEach(() => {
  mocks.transaction.mockReset();
  mocks.queryOne.mockReset();
  mocks.query.mockReset();
});

/**
 * A tenant could claim a custom domain, never verify it, and hold it forever: custom_domain is
 * UNIQUE whether or not it is verified, so the rightful owner was blocked with no way out.
 * Nothing expired the claim, and the 7-day verification record nothing acted on would not have
 * freed the column anyway.
 */
describe('TenantService.releaseUnverifiedDomains', () => {
  it('only ever selects unverified claims with no recent verification record', async () => {
    const calls = fakeSweep([]);

    await TenantService.releaseUnverifiedDomains(CLAIM_DAYS);

    const select = calls[0];
    expect(select.sql).toContain('custom_domain_verified = false');
    expect(select.sql).toContain('custom_domain IS NOT NULL');
    // The claim date comes from the verification record the attach path always writes in the
    // same transaction as the claim, so no schema change is needed.
    expect(select.sql).toContain('NOT EXISTS');
    expect(select.sql).toContain("dv.created_at > NOW() - ($1 * INTERVAL '1 day')");
    expect(select.params).toEqual([CLAIM_DAYS]);
  });

  it('locks the candidates it is about to clear', async () => {
    // Without the lock a verification committing between the read and the write would have its
    // result thrown away, unbinding a domain that had just been proven.
    const calls = fakeSweep([]);

    await TenantService.releaseUnverifiedDomains(CLAIM_DAYS);

    expect(calls[0].sql).toContain('FOR UPDATE');
  });

  it('clears the whole claim so the domain is free for its rightful owner', async () => {
    const calls = fakeSweep([claim()]);

    await TenantService.releaseUnverifiedDomains(CLAIM_DAYS);

    const update = calls[1];
    expect(update.sql).toContain('UPDATE tenants');
    expect(update.sql).toContain('custom_domain = NULL');
    expect(update.sql).toContain('custom_domain_verified_at = NULL');
    expect(update.params[0]).toEqual(['tenant-1']);
  });

  it('reports the domain it released, read before the row was cleared', async () => {
    // RETURNING would report the NEW row, whose custom_domain is NULL by construction.
    fakeSweep([claim()]);

    const released = await TenantService.releaseUnverifiedDomains(CLAIM_DAYS);

    expect(released).toEqual([{ username: 'alice', domain: 'mine.example.test' }]);
  });

  it('deletes the stale verification records of the claims it released', async () => {
    const calls = fakeSweep([claim()]);

    await TenantService.releaseUnverifiedDomains(CLAIM_DAYS);

    const cleanup = calls[2];
    expect(cleanup.sql).toContain('DELETE FROM domain_verifications');
    expect(cleanup.sql).toContain('verified = false');
    expect(cleanup.params).toEqual([['tenant-1']]);
  });

  it('leaves a claim alone while its verification record is inside the window', async () => {
    const calls = fakeSweep([claim({ record_created_at: new Date(Date.now() - DAY) })]);

    const released = await TenantService.releaseUnverifiedDomains(CLAIM_DAYS);

    expect(released).toEqual([]);
    // Nothing beyond the candidate read: no claim was cleared.
    expect(calls).toHaveLength(1);
  });

  it('writes nothing when there is nothing to release', async () => {
    const calls = fakeSweep([]);

    const released = await TenantService.releaseUnverifiedDomains(CLAIM_DAYS);

    expect(released).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

/**
 * The sweep used to leave a claim alone for an hour after ANY write to its tenant row, because
 * the attach committed the claim and the record that dates it separately and a sweep landing
 * between them would have cleared a claim seconds old. The attach is one transaction now, and
 * with the window gone the two ways a holder could postpone a release indefinitely are closed.
 */
describe('nothing but a fresh verification record can postpone a release', () => {
  it('releases a claim whose tenant row was written a moment ago', async () => {
    // A config save bumps updated_at through a trigger, so an account that saved more often than
    // once an hour used to keep an unverifiable domain for as long as it kept saving.
    const calls = fakeSweep([claim({ updated_at: new Date() })]);

    const released = await TenantService.releaseUnverifiedDomains(CLAIM_DAYS);

    expect(released).toEqual([{ username: 'alice', domain: 'mine.example.test' }]);
    expect(calls[0].sql).not.toContain('updated_at <');
  });

  /**
   * Re-submitting the same domain used to write a fresh verification record, which restarted the
   * clock and let a holder keep a domain forever by re-posting it. The attach keeps the earliest
   * record for a domain the tenant already holds (proved in domain-attach.test.ts), so the record
   * still dates the claim from the first submit and the sweep still releases it.
   */
  it('releases a re-submitted claim whose earliest record is outside the window', async () => {
    const calls = fakeSweep([
      claim({
        updated_at: new Date(),
        record_created_at: new Date(Date.now() - (CLAIM_DAYS + 1) * DAY),
      }),
    ]);

    const released = await TenantService.releaseUnverifiedDomains(CLAIM_DAYS);

    expect(released).toEqual([{ username: 'alice', domain: 'mine.example.test' }]);
    expect(calls[1].sql).toContain('UPDATE tenants');
  });
});

/**
 * Under READ COMMITTED a row that was being updated when the SELECT reached it is re-checked
 * against the updated version, but subqueries in that re-check still run on the statement's
 * original snapshot. So an attach that commits while the sweep waits for the row lock is
 * invisible to the candidate SELECT's NOT EXISTS, and the sweep would unbind a domain claimed a
 * moment ago. The UPDATE repeats the predicate on a fresh snapshot of rows it already holds
 * locked, which is what actually settles it.
 */
describe('a claim attached while the sweep waited for its lock survives', () => {
  it('does not clear a row whose verification record landed after the candidate read', async () => {
    const rows = [claim()];
    const calls = fakeSweep(rows, (current) => {
      // The attach committed: the tenant now holds the domain with a record written alongside it.
      current[0].record_created_at = new Date();
    });

    const released = await TenantService.releaseUnverifiedDomains(CLAIM_DAYS);

    expect(released).toEqual([]);
    expect(rows[0].custom_domain).toBe('mine.example.test');
    // The re-check is in the UPDATE itself, so it can never be skipped by an early return.
    expect(calls[1].sql).toContain('UPDATE tenants');
    expect(calls[1].sql).toContain('NOT EXISTS');
    expect(calls[1].params).toEqual([['tenant-1'], CLAIM_DAYS]);
    // Nothing was released, so no verification records are deleted either.
    expect(calls.some((call) => /DELETE FROM domain_verifications/.test(call.sql))).toBe(false);
  });

  it('still releases the claims that did not change under it', async () => {
    const rows = [claim(), claim({ id: 'tenant-2', username: 'bob', custom_domain: 'other.example.test' })];
    fakeSweep(rows, (current) => {
      current[0].record_created_at = new Date();
    });

    const released = await TenantService.releaseUnverifiedDomains(CLAIM_DAYS);

    expect(released).toEqual([{ username: 'bob', domain: 'other.example.test' }]);
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

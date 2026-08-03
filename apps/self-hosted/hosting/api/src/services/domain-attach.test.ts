import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  // Anything the attach runs outside its transaction is a second commit, which is the bug this
  // suite exists to prevent, so the pooled helpers refuse rather than answer.
  query: vi.fn(() => {
    throw new Error('statement ran outside the attach transaction');
  }),
  queryOne: vi.fn(() => {
    throw new Error('statement ran outside the attach transaction');
  }),
}));

vi.mock('../db/client', () => ({
  db: { transaction: mocks.transaction, query: mocks.query, queryOne: mocks.queryOne },
}));
vi.mock('@ecency/sdk/hive', () => ({ callRPC: vi.fn(), config: { set: vi.fn() } }));

const { DomainService } = await import('./domain-service');
const { DomainInUseError } = await import('./tenant-service');

const DAY = 24 * 60 * 60 * 1000;

interface TenantRow {
  id: string;
  username: string;
  custom_domain: string | null;
  custom_domain_verified: boolean;
  custom_domain_verified_at: string | null;
  updated_at: string;
}

interface VerificationRow {
  id: string;
  tenant_id: string;
  domain: string;
  verification_token: string;
  verification_method: 'cname';
  verified: boolean;
  verified_at: string | null;
  expires_at: string;
  created_at: string;
}

interface State {
  tenants: TenantRow[];
  verifications: VerificationRow[];
}

/**
 * A database that commits the way Postgres does, so atomicity can be asserted rather than
 * inferred from which mock was called.
 *
 * Statements run against a private copy of the state and are published only when the callback
 * returns; a throw discards them, which is what db.transaction's ROLLBACK does. Every test here
 * then reads the COMMITTED state, so a half-applied attach is visible as one.
 *
 * The interpreter honours the clauses that carry meaning for this file (which verification
 * records a statement deletes, whether it looks for an existing one) so that dropping a clause
 * changes a result. What the claim UPDATE preserves is modelled from the statement's intent; the
 * statement text itself is pinned in set-custom-domain.test.ts.
 */
function fakeDatabase(initial: State, failOn?: RegExp) {
  const committed: State = structuredClone(initial);
  const log: { sql: string; params: any[] }[] = [];
  let nextId = 1;

  const client = (state: State) => ({
    query: async (raw: string, params: any[] = []) => {
      const sql = raw.replace(/\s+/g, ' ').trim();
      log.push({ sql, params });
      if (failOn?.test(sql)) throw new Error('statement failed');

      if (/^UPDATE tenants/.test(sql)) {
        const [username, domain] = params;
        const holder = state.tenants.find(
          (row) => row.custom_domain === domain && row.username !== username
        );
        // custom_domain is UNIQUE across tenants whatever its verified flag says.
        if (holder) throw Object.assign(new Error('duplicate key'), { code: '23505' });

        const tenant = state.tenants.find((row) => row.username === username);
        if (!tenant) return { rows: [], rowCount: 0 };

        const unchanged = tenant.custom_domain === domain;
        tenant.custom_domain_verified = unchanged ? tenant.custom_domain_verified : false;
        tenant.custom_domain_verified_at = unchanged ? tenant.custom_domain_verified_at : null;
        tenant.custom_domain = domain;
        tenant.updated_at = new Date().toISOString();
        return { rows: [{ ...tenant }], rowCount: 1 };
      }

      if (/^DELETE FROM domain_verifications/.test(sql)) {
        const [tenantId, domain] = params;
        // Without the domain exclusion the statement drops every record the tenant has,
        // including the one that dates the claim it is about to re-affirm.
        const keepsCurrent = /domain <> \$2/.test(sql);
        const before = state.verifications.length;
        state.verifications = state.verifications.filter(
          (row) => row.tenant_id !== tenantId || (keepsCurrent && row.domain === domain)
        );
        return { rows: [], rowCount: before - state.verifications.length };
      }

      if (/^SELECT \* FROM domain_verifications/.test(sql)) {
        const [tenantId, domain] = params;
        const rows = state.verifications
          .filter((row) => row.tenant_id === tenantId && row.domain === domain)
          .sort((a, b) => a.created_at.localeCompare(b.created_at));
        return { rows: /LIMIT 1/.test(sql) ? rows.slice(0, 1) : rows, rowCount: rows.length };
      }

      if (/^INSERT INTO domain_verifications/.test(sql)) {
        const [tenantId, domain, token, expiresAt] = params;
        const row: VerificationRow = {
          id: `verification-${nextId++}`,
          tenant_id: tenantId,
          domain,
          verification_token: token,
          verification_method: 'cname',
          verified: false,
          verified_at: null,
          expires_at: new Date(expiresAt).toISOString(),
          created_at: new Date().toISOString(),
        };
        state.verifications.push(row);
        return { rows: [{ ...row }], rowCount: 1 };
      }

      throw new Error(`unexpected statement: ${sql}`);
    },
  });

  mocks.transaction.mockImplementation(async (fn: (c: any) => Promise<any>) => {
    const staged = structuredClone(committed);
    const result = await fn(client(staged));
    // Reached only when the callback returned: a throw leaves `staged` unpublished, exactly as
    // a ROLLBACK leaves the transaction's writes unapplied.
    committed.tenants = staged.tenants;
    committed.verifications = staged.verifications;
    return result;
  });

  return { state: committed, log };
}

function tenant(over: Partial<TenantRow> = {}): TenantRow {
  return {
    id: 'tenant-1',
    username: 'alice',
    custom_domain: null,
    custom_domain_verified: false,
    custom_domain_verified_at: null,
    updated_at: new Date().toISOString(),
    ...over,
  };
}

function verification(over: Partial<VerificationRow> = {}): VerificationRow {
  return {
    id: 'verification-0',
    tenant_id: 'tenant-1',
    domain: 'mine.example.test',
    verification_token: '_ecency-verify.original',
    verification_method: 'cname',
    verified: false,
    verified_at: null,
    expires_at: new Date(Date.now() + 7 * DAY).toISOString(),
    created_at: new Date(Date.now() - 10 * DAY).toISOString(),
    ...over,
  };
}

beforeEach(() => {
  mocks.transaction.mockReset();
  mocks.query.mockClear();
  mocks.queryOne.mockClear();
});

/**
 * Attaching a domain was two separately committed operations: the claim, then the verification
 * record, whose own DELETE and INSERT were two more. Between any of them the tenant held a domain
 * with no record backing it, and the release sweep dates a claim by that record, so a sweep
 * landing in one of those windows freed a claim seconds old.
 */
describe('DomainService.attachDomain', () => {
  it('claims the domain and issues its verification in a single transaction', async () => {
    const db = fakeDatabase({ tenants: [tenant()], verifications: [] });

    const attached = await DomainService.attachDomain('alice', 'mine.example.test');

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(db.state.tenants[0].custom_domain).toBe('mine.example.test');
    expect(db.state.verifications).toHaveLength(1);
    expect(attached.verification?.domain).toBe('mine.example.test');
    // A claim published on its own connection would be a separate commit and the gap would be back.
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.queryOne).not.toHaveBeenCalled();
  });

  /**
   * The failure the split path could not survive: the DELETE had already removed the record, the
   * claim had already committed, and the INSERT then failed. The tenant was left holding a domain
   * with nothing dating it, and its verified flag cleared, so the next sweep could take a live
   * domain away from a paying customer.
   */
  it('leaves the previous domain and its record untouched when the record cannot be written', async () => {
    const db = fakeDatabase(
      {
        tenants: [
          tenant({
            custom_domain: 'live.example.test',
            custom_domain_verified: true,
            custom_domain_verified_at: new Date().toISOString(),
          }),
        ],
        verifications: [verification({ domain: 'live.example.test', verified: true })],
      },
      /^INSERT INTO domain_verifications/
    );

    await expect(DomainService.attachDomain('alice', 'new.example.test')).rejects.toThrow(
      'statement failed'
    );

    expect(db.state.tenants[0].custom_domain).toBe('live.example.test');
    expect(db.state.tenants[0].custom_domain_verified).toBe(true);
    expect(db.state.verifications).toHaveLength(1);
    expect(db.state.verifications[0].domain).toBe('live.example.test');
  });

  it('reports a domain another tenant holds as a conflict', async () => {
    const db = fakeDatabase({
      tenants: [tenant(), tenant({ id: 'tenant-2', username: 'bob', custom_domain: 'taken.example.test' })],
      verifications: [],
    });

    await expect(DomainService.attachDomain('alice', 'taken.example.test')).rejects.toBeInstanceOf(
      DomainInUseError
    );
    expect(db.state.tenants[0].custom_domain).toBeNull();
  });

  it('reports a missing tenant without writing anything', async () => {
    const db = fakeDatabase({ tenants: [], verifications: [] });

    await expect(DomainService.attachDomain('nobody', 'mine.example.test')).rejects.toThrow(
      'Tenant not found'
    );
    expect(db.state.verifications).toEqual([]);
  });
});

/**
 * Re-submitting the same domain used to write a fresh verification record. That record is what
 * the release sweep dates a claim by, so a holder could keep an unverifiable domain forever by
 * re-posting it once a fortnight. The earliest record for a domain the tenant already holds now
 * stays, and with it the claim's original date.
 */
describe('re-submitting a domain the tenant already holds', () => {
  it('keeps the earliest verification record rather than restarting the claim clock', async () => {
    const original = verification();
    const db = fakeDatabase({
      tenants: [tenant({ custom_domain: 'mine.example.test' })],
      verifications: [original],
    });

    const attached = await DomainService.attachDomain('alice', 'mine.example.test');

    expect(db.state.verifications).toHaveLength(1);
    expect(db.state.verifications[0].created_at).toBe(original.created_at);
    expect(db.state.verifications[0].verification_token).toBe(original.verification_token);
    expect(attached.verification?.createdAt.toISOString()).toBe(original.created_at);
  });

  it('does not re-issue verification at all for a domain that is already verified', async () => {
    // Re-issuing would delete the live record, and the origin sync would drop the vhost and the
    // certificate with it.
    const live = verification({ domain: 'live.example.test', verified: true });
    const db = fakeDatabase({
      tenants: [tenant({ custom_domain: 'live.example.test', custom_domain_verified: true })],
      verifications: [live],
    });

    const attached = await DomainService.attachDomain('alice', 'live.example.test');

    expect(attached.verification).toBeNull();
    expect(db.state.verifications).toEqual([live]);
    expect(db.log.every((call) => /^UPDATE tenants/.test(call.sql))).toBe(true);
  });

  it('issues a fresh record for a domain the tenant did not hold before', async () => {
    const stale = verification({ domain: 'old.example.test' });
    const db = fakeDatabase({
      tenants: [tenant({ custom_domain: 'old.example.test' })],
      verifications: [stale],
    });

    const attached = await DomainService.attachDomain('alice', 'new.example.test');

    // The record for a domain the tenant no longer holds goes: it would otherwise date a claim
    // nobody made, and the sweep matches records to the domain currently held.
    expect(db.state.verifications).toHaveLength(1);
    expect(db.state.verifications[0].domain).toBe('new.example.test');
    expect(db.state.verifications[0].created_at).not.toBe(stale.created_at);
    expect(attached.verification?.domain).toBe('new.example.test');
  });
});

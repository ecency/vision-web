import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SqlExecutor } from '../db/client';

// The pooled client is never used here: every statement goes through the PGlite executor below.
vi.mock('../db/client', () => ({ db: {} }));
vi.mock('@ecency/sdk/hive', () => ({ callRPC: vi.fn(), config: { set: vi.fn() } }));

const { TenantService, DomainInUseError } = await import('./tenant-service');

/**
 * setCustomDomain against a real Postgres engine (PGlite), loaded with the deployed schema.
 *
 * The attach suites run SQL through a hand-written interpreter, which cannot see type errors
 * Postgres raises while planning a statement. That is how a parameter used both as a VARCHAR
 * assignment and in a comparison ("inconsistent types deduced for parameter $2") shipped and
 * failed every custom-domain attach.
 */
const SRC_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const DB_DIR = join(SRC_DIR, '../../db');

let pg: PGlite;
let exec: SqlExecutor;

beforeAll(async () => {
  pg = new PGlite({ extensions: { uuid_ossp } });
  await pg.exec(readFileSync(join(DB_DIR, 'init.sql'), 'utf8'));
  const migrations = readdirSync(join(DB_DIR, 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of migrations) {
    await pg.exec(readFileSync(join(DB_DIR, 'migrations', file), 'utf8'));
  }
  // pg.query in PGlite uses the extended protocol with untyped parameters, like node-postgres,
  // so Postgres deduces each parameter's type from the statement exactly as in production.
  exec = { query: (text: string, params?: any[]) => pg.query(text, params) as any };
});

afterAll(async () => {
  await pg?.close();
});

beforeEach(async () => {
  await pg.exec('DELETE FROM tenants');
});

async function addTenant(username: string, domain: string | null = null, verified = false) {
  await pg.query(
    `INSERT INTO tenants (username, owner, custom_domain, custom_domain_verified, custom_domain_verified_at)
     VALUES ($1::varchar, $1::varchar, $2::varchar, $3::boolean, CASE WHEN $3::boolean THEN NOW() END)`,
    [username, domain, verified],
  );
}

async function row(username: string) {
  const r = await pg.query<{
    custom_domain: string | null;
    custom_domain_verified: boolean;
    custom_domain_verified_at: Date | null;
  }>(
    'SELECT custom_domain, custom_domain_verified, custom_domain_verified_at FROM tenants WHERE username = $1',
    [username],
  );
  return r.rows[0];
}

describe('TenantService.setCustomDomain on Postgres', () => {
  it('attaches a domain to a tenant that has none', async () => {
    await addTenant('alice');

    const tenant = await TenantService.setCustomDomain(exec, 'alice', 'www.example.com');

    expect(tenant.customDomain).toBe('www.example.com');
    expect(await row('alice')).toMatchObject({
      custom_domain: 'www.example.com',
      custom_domain_verified: false,
      custom_domain_verified_at: null,
    });
  });

  it('keeps verification when the same domain is submitted again, in any case', async () => {
    await addTenant('alice', 'example.com', true);
    const before = await row('alice');

    await TenantService.setCustomDomain(exec, 'Alice', 'Example.COM');

    const after = await row('alice');
    expect(after.custom_domain).toBe('example.com');
    expect(after.custom_domain_verified).toBe(true);
    expect(after.custom_domain_verified_at).toEqual(before.custom_domain_verified_at);
  });

  it('clears verification when a different domain is set', async () => {
    await addTenant('alice', 'example.com', true);

    await TenantService.setCustomDomain(exec, 'alice', 'other.example.org');

    expect(await row('alice')).toMatchObject({
      custom_domain: 'other.example.org',
      custom_domain_verified: false,
      custom_domain_verified_at: null,
    });
  });

  it('refuses a domain another tenant holds', async () => {
    await addTenant('bob', 'example.com');
    await addTenant('alice');

    await expect(TenantService.setCustomDomain(exec, 'alice', 'example.com')).rejects.toBeInstanceOf(
      DomainInUseError,
    );
    expect((await row('alice')).custom_domain).toBeNull();
  });
});

/**
 * The same failure class anywhere in the service: Postgres refuses to PLAN a statement whose
 * parameters it cannot type, and no mocked suite ever plans one. Every static parameterized
 * statement in src (backtick or single-quoted) is prepared against the schema. Statements built
 * with ${} interpolation are
 * left out because their text is only known at run time.
 *
 * PGlite runs a newer Postgres major than production, so syntax only newer majors accept could
 * still pass here; the type deduction this guards has not changed across those majors.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : [];
  });
}

const STATEMENTS = sourceFiles(SRC_DIR).flatMap((file) =>
  [
    ...readFileSync(file, 'utf8').matchAll(
      /(['`])(\s*(?:SELECT|UPDATE|INSERT|DELETE|WITH)\b(?:(?!\1)[^\\]|\\.)*)\1/gi,
    ),
  ]
    .map((m) => m[2])
    .filter((sql) => !sql.includes('${') && /\$\d/.test(sql))
    .map((sql) => ({ file: file.slice(SRC_DIR.length + 1), sql })),
);

describe('every parameterized statement plans on Postgres', () => {
  it('finds the statements it is meant to check', () => {
    // Guards the extraction itself: a regex that silently matched nothing would pass every case.
    expect(STATEMENTS.length).toBeGreaterThan(50);
    expect(STATEMENTS.some((s) => s.sql.includes('custom_domain_verified ='))).toBe(true);
  });

  it.each(STATEMENTS.map((s, i) => [`${s.file} #${i}`, s.sql]))('%s', async (_name, sql) => {
    await pg.exec(`PREPARE stmt AS ${String(sql).replace(/;\s*$/, '')}`);
    await pg.exec('DEALLOCATE stmt');
  });
});

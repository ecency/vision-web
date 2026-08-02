import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock('pg', () => ({
  default: { Pool: class { connect = mocks.connect; on() {} query() {} } },
}));

process.env.DATABASE_URL = 'postgres://test';
const { withAdvisoryLock } = await import('./client');

function client(failOn?: string) {
  const release = vi.fn();
  const queries: string[] = [];
  return {
    release,
    queries,
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      if (failOn && sql.includes(failOn)) throw new Error(`${failOn} failed`);
      return { rows: [] };
    }),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => mocks.connect.mockReset());
afterEach(() => vi.restoreAllMocks());

/**
 * The lock holds a pooled connection for the duration of the work, so every
 * exit path has to hand it back. A leak here is invisible until repeated
 * failures exhaust the 20-client pool and unrelated queries start timing out.
 */
describe('withAdvisoryLock client handling', () => {
  it('releases the client when the lock cannot be acquired', async () => {
    const c = client('pg_advisory_lock');
    mocks.connect.mockResolvedValue(c);

    const result = await withAdvisoryLock(1, 2, async () => 'ran anyway');
    await flush();

    expect(result).toBe('ran anyway');
    expect(c.release).toHaveBeenCalledTimes(1);
  });

  it('releases the client when setting the timeout fails', async () => {
    const c = client('SET lock_timeout');
    mocks.connect.mockResolvedValue(c);

    await withAdvisoryLock(1, 2, async () => 'ok');
    await flush();

    expect(c.release).toHaveBeenCalledTimes(1);
  });

  it('does not try to release when the connection itself failed', async () => {
    mocks.connect.mockRejectedValue(new Error('pool exhausted'));

    await expect(withAdvisoryLock(1, 2, async () => 'ok')).resolves.toBe('ok');
  });

  it('resets the session timeout before handing the client back', async () => {
    const c = client();
    mocks.connect.mockResolvedValue(c);

    await withAdvisoryLock(1, 2, async () => 'ok');
    await flush();

    // SET without LOCAL outlives the checkout, and pooled clients are reused.
    expect(c.queries).toContain('RESET lock_timeout');
    expect(c.queries.indexOf('RESET lock_timeout')).toBeGreaterThan(
      c.queries.findIndex((q) => q.includes('pg_advisory_unlock')),
    );
    expect(c.release).toHaveBeenCalledWith();
  });

  it('discards the connection when the reset fails', async () => {
    const c = client('RESET lock_timeout');
    mocks.connect.mockResolvedValue(c);

    await withAdvisoryLock(1, 2, async () => 'ok');
    await flush();

    // A session whose state cannot be established must not be reused.
    expect(c.release).toHaveBeenCalledWith(true);
  });

  it('destroys the client when the advisory lock cannot be released', async () => {
    // Advisory locks are session scoped: handing this connection back to the
    // pool would keep the lock held for the life of the connection and block
    // every later writer for that tenant.
    const c = client('pg_advisory_unlock');
    mocks.connect.mockResolvedValue(c);

    await withAdvisoryLock(1, 2, async () => 'ok');
    await flush();

    expect(c.release).toHaveBeenCalledWith(true);
    // The reset is pointless on a connection being destroyed.
    expect(c.queries).not.toContain('RESET lock_timeout');
  });

  it('releases the client even when the work throws', async () => {
    const c = client();
    mocks.connect.mockResolvedValue(c);

    await expect(
      withAdvisoryLock(1, 2, async () => {
        throw new Error('work failed');
      }),
    ).rejects.toThrow('work failed');
    await flush();

    expect(c.release).toHaveBeenCalledTimes(1);
  });
});

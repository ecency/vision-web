/**
 * Database Client
 */

import pg from 'pg';

const { Pool } = pg;

// Create connection pool
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.on('connect', () => {
  console.log('Database connected');
});

pool.on('error', (err) => {
  console.error('Database error:', err);
});

/**
 * Anything statements can be run on: the pool helper below, or a transaction client.
 *
 * Service functions that must be able to share ONE transaction with a caller take this
 * instead of reaching for `db` themselves. A function that reaches for the module-level
 * `db` runs on its own connection, so it commits separately no matter what the caller
 * wrapped around it, which is how the custom-domain attach ended up as two commits.
 */
export interface SqlExecutor {
  query<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>>;
}

// Helper for single queries
export const db = {
  query: <T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>> => {
    return pool.query<T>(text, params);
  },

  // Get single row or null
  queryOne: async <T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<T | null> => {
    const result = await pool.query<T>(text, params);
    return result.rows[0] || null;
  },

  // Get all rows
  queryAll: async <T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<T[]> => {
    const result = await pool.query<T>(text, params);
    return result.rows;
  },
  
  // Transaction helper
  transaction: async <T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },
};

/**
 * Serialize an operation across PROCESSES on a Postgres advisory lock.
 *
 * The hosting API and the payment listener are separate containers, so the
 * per-tenant promise chain in config-service, which is a process-local Map,
 * cannot order their writes against each other. An advisory lock is held on one
 * session, so the work runs on a dedicated pooled client for its duration.
 *
 * Degrades rather than blocks: if the lock cannot be taken the operation still
 * runs, ordered only within this process. That is the behaviour before this
 * existed, so a database problem cannot make config publication worse than it
 * already was, and the served file self-heals on the next periodic sync.
 */
const ADVISORY_LOCK_TIMEOUT_MS = 5000;

export async function withAdvisoryLock<T>(
  namespace: number,
  key: number,
  fn: () => Promise<T>
): Promise<T> {
  // No database configured (unit tests): nothing to coordinate with.
  if (!process.env.DATABASE_URL) return fn();

  let client: pg.PoolClient | undefined;
  try {
    client = await pool.connect();
    // Advisory waits honour lock_timeout, so a stuck holder cannot wedge the
    // periodic sync; the timeout surfaces as an error and we degrade below.
    await client.query(`SET lock_timeout = ${ADVISORY_LOCK_TIMEOUT_MS}`);
    await client.query('SELECT pg_advisory_lock($1, $2)', [namespace, key]);
  } catch (error) {
    // The connection may already be checked out: a lock timeout throws AFTER
    // connect succeeded. Returning without releasing would leak one client per
    // failure and exhaust the pool under repeated timeouts.
    if (client) releaseLockClient(client);
    console.warn(
      '[Db] Advisory lock unavailable, continuing without cross-process ordering:',
      (error as Error).message
    );
    return fn();
  }

  try {
    return await fn();
  } finally {
    let stillLocked = false;
    try {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [namespace, key]);
    } catch (error) {
      // The unlock did not run, so this session may still hold the lock.
      stillLocked = true;
      console.error('[Db] Failed to release advisory lock:', (error as Error).message);
    }
    releaseLockClient(client, stillLocked);
  }
}

/**
 * Return a lock client to the pool with the session state it was given wiped.
 *
 * SET without LOCAL lives for the whole session, and pooled connections are
 * reused, so a client handed back as-is would carry lock_timeout to unrelated
 * queries. If the reset itself fails the connection is destroyed instead, since
 * a session whose state cannot be established must not be reused.
 */
function releaseLockClient(client: pg.PoolClient, stillLocked = false): void {
  if (stillLocked) {
    // Advisory locks live for the session, so returning this connection to the
    // pool would keep the lock held for the life of the connection and block
    // every later writer for that tenant. Destroy it instead: ending the
    // backend session is what actually drops the lock.
    console.error('[Db] Discarding lock client that may still hold its advisory lock');
    client.release(true);
    return;
  }

  client
    .query('RESET lock_timeout')
    .then(() => client.release())
    .catch((error) => {
      console.error('[Db] Failed to reset lock client, discarding it:', (error as Error).message);
      client.release(true);
    });
}

export default db;

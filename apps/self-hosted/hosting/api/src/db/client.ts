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

  let client: pg.PoolClient;
  try {
    client = await pool.connect();
    // Advisory waits honour lock_timeout, so a stuck holder cannot wedge the
    // periodic sync; the timeout surfaces as an error and we degrade below.
    await client.query(`SET lock_timeout = ${ADVISORY_LOCK_TIMEOUT_MS}`);
    await client.query('SELECT pg_advisory_lock($1, $2)', [namespace, key]);
  } catch (error) {
    console.warn(
      '[Db] Advisory lock unavailable, continuing without cross-process ordering:',
      (error as Error).message
    );
    return fn();
  }

  try {
    return await fn();
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [namespace, key]);
    } catch (error) {
      // The lock is session scoped, so releasing the client drops it anyway.
      console.error('[Db] Failed to release advisory lock:', (error as Error).message);
    }
    client.release();
  }
}

export default db;

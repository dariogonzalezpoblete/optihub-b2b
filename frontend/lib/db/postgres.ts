// frontend/lib/db/postgres.ts
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

/**
 * Interface representing the database configuration parameters
 */
export interface DatabasePoolConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  statement_timeout?: number;
}

// Global reference to ensure a singleton pool across Next.js hot reloads in development
declare global {
  // eslint-disable-next-line no-var
  var __optihubPgPool: Pool | undefined;
}

/**
 * Builds the pool configuration based on environment variables.
 * Automatically handles Supabase, local PostgreSQL, or standard cloud DB connection strings.
 */
function getPoolConfig(): DatabasePoolConfig {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.SUPABASE_DB_URL ||
    undefined;

  if (connectionString) {
    const isLocal =
      connectionString.includes('localhost') ||
      connectionString.includes('127.0.0.1') ||
      connectionString.includes('::1');

    return {
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: Number(process.env.PG_POOL_MAX || 20),
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
      connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS || 10000),
      statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS || 15000),
    };
  }

  const host = (process.env.PGHOST || '127.0.0.1').trim();
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const sslMode = process.env.PGSSLMODE?.toLowerCase();
  const requiresSsl = sslMode === 'require' || (!isLocalHost && sslMode !== 'disable');

  return {
    host,
    port: Number.parseInt(process.env.PGPORT || '5432', 10),
    database: (process.env.PGDATABASE || 'optihub').trim(),
    user: (process.env.PGUSER || 'postgres').trim(),
    password: process.env.PGPASSWORD || 'postgres',
    ssl: requiresSsl ? { rejectUnauthorized: false } : false,
    max: Number(process.env.PG_POOL_MAX || 20),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS || 10000),
    statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS || 15000),
  };
}

/**
 * Initializes and returns the singleton PostgreSQL Pool instance.
 */
export function getPool(): Pool {
  if (!globalThis.__optihubPgPool) {
    const config = getPoolConfig();
    const pool = new Pool(config);

    // Event listener to monitor idle connection errors in the background
    pool.on('error', (err: Error) => {
      console.error('[PostgreSQL Pool] Unexpected error on idle client:', err.message);
    });

    globalThis.__optihubPgPool = pool;
  }

  return globalThis.__optihubPgPool;
}

/**
 * Checks whether an error is caused by connection pool failure or exhaustion.
 */
export function isPoolConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const msg = (error as { message?: string }).message || '';
  const code = (error as { code?: string }).code;

  return (
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'EHOSTUNREACH' ||
    code === '28P01' || // invalid_password
    code === '08001' || // sqlclient_unable_to_establish_sqlconnection
    code === '08006' || // connection_failure
    code === '57P01' || // admin_shutdown
    msg.includes('Connection terminated') ||
    msg.includes('timeout exceeded when trying to connect') ||
    msg.includes('connection timeout') ||
    msg.includes('remaining connection slots are reserved')
  );
}

/**
 * Checks whether an error is a PostgreSQL deadlock or serialization conflict.
 */
export function isTransientConcurrencyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  // 40P01 = deadlock_detected, 40001 = serialization_failure
  return code === '40P01' || code === '40001';
}

/**
 * Options for transaction execution
 */
export interface TransactionOptions {
  isolationLevel?: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * Executes a callback within an explicit PostgreSQL transaction (BEGIN, COMMIT, ROLLBACK).
 * Handles safe client acquisition, row lock operations, automatic rollbacks on failure,
 * retry on transient deadlock conflicts (40P01), and guaranteed client release in finally.
 *
 * @param callback The function performing queries inside the transaction
 * @param options Transaction options (isolation level, retries for deadlock/serialization)
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
  options: TransactionOptions = {}
): Promise<T> {
  const pool = getPool();
  const maxRetries = options.maxRetries ?? 2;
  const initialRetryDelay = options.retryDelayMs ?? 100;
  const isolationLevel = options.isolationLevel || 'READ COMMITTED';

  let attempts = 0;

  while (attempts <= maxRetries) {
    attempts++;
    let client: PoolClient | null = null;

    try {
      client = await pool.connect();
    } catch (connectError: unknown) {
      console.error('[PostgreSQL Pool] Error acquiring client from pool:', connectError);
      throw connectError;
    }

    try {
      // Explicit PostgreSQL BEGIN with specified isolation level
      await client.query(`BEGIN TRANSACTION ISOLATION LEVEL ${isolationLevel}`);

      // Execute caller's transactional business logic
      const result = await callback(client);

      // Explicit PostgreSQL COMMIT
      await client.query('COMMIT');
      return result;
    } catch (txnError: unknown) {
      // Explicit PostgreSQL ROLLBACK on any failure
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr: unknown) {
        console.error('[PostgreSQL Transaction] Error executing ROLLBACK:', rollbackErr);
      }

      // If error is transient deadlock (40P01) or serialization failure (40001) and retries remain, retry
      if (isTransientConcurrencyError(txnError) && attempts <= maxRetries) {
        const jitter = Math.floor(Math.random() * 50);
        const delay = initialRetryDelay * Math.pow(2, attempts - 1) + jitter;
        console.warn(
          `[PostgreSQL Transaction] Transient concurrency error (${(txnError as { code?: string }).code}). Retrying attempt ${attempts}/${maxRetries} after ${delay}ms...`
        );
        await new Promise((res) => setTimeout(res, delay));
        continue;
      }

      throw txnError;
    } finally {
      // Always release client back to the pool
      if (client) {
        client.release();
      }
    }
  }

  throw new Error('Transaction failed after exceeding maximum retry attempts');
}

/**
 * Directly executes a standalone query using the pool.
 */
export async function executeQuery<T extends QueryResultRow = any>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  const pool = getPool();
  return pool.query<T>(text, params);
}

/**
 * Checks database connectivity and returns connection health & pool statistics.
 */
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  latencyMs?: number;
  poolStats: { totalCount: number; idleCount: number; waitingCount: number };
  error?: string;
}> {
  const pool = getPool();
  const poolStats = {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };

  const start = Date.now();
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1 AS health_check');
      const latencyMs = Date.now() - start;
      return { healthy: true, latencyMs, poolStats };
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      healthy: false,
      poolStats,
      error: errorMessage,
    };
  }
}

/**
 * Gracefully shuts down the connection pool (useful for test teardown or process shutdown).
 */
export async function closePool(): Promise<void> {
  if (globalThis.__optihubPgPool) {
    await globalThis.__optihubPgPool.end();
    globalThis.__optihubPgPool = undefined;
  }
}

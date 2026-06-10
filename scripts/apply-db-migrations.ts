/**
 * apply-db-migrations.ts
 *
 * Raw SQL migration runner for db/migrations/*.sql files.
 *
 * Applies numbered migration files (0001_*.sql, 0002_*.sql, …) in lexical order,
 * followed by any non-numbered .sql files (e.g. audit_log_protection.sql).
 * Each file is wrapped in a transaction and recorded in the `raw_sql_migrations`
 * tracking table so it is executed exactly once.
 *
 * Safety properties:
 *  - Session advisory lock (pg_try_advisory_lock) prevents concurrent runners.
 *  - Each file is wrapped in BEGIN/COMMIT; failure rolls back only that file.
 *  - Idempotent: already-applied files (same filename) are skipped.
 *  - audit_log_protection.sql references a role that may not exist in dev/CI;
 *    failures are treated as warnings and the file is marked applied so it does
 *    not block subsequent boots.
 *  - Exits 0 on success; exits 1 on fatal error.
 *
 * Run via:  npm run db:migrate
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { config as loadEnv } from 'dotenv';

const MIGRATIONS_DIR = path.join(process.cwd(), 'db', 'migrations');
const TRACKING_TABLE = 'raw_sql_migrations';
// Stable integer lock key for the migration runner (safe within pg_advisory_lock's int8 range).
const ADVISORY_LOCK_KEY = 1_234_567_890;

// Files that are allowed to fail (role/permission statements that may not apply to dev).
const WARN_ON_FAILURE = new Set(['audit_log_protection.sql']);

async function run(): Promise<void> {
  loadEnv({ path: '.env.local' });
  loadEnv();

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run migrations');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    // Acquire session advisory lock so only one runner executes at a time.
    const { rows: lockRows } = await client.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS acquired',
      [ADVISORY_LOCK_KEY],
    );
    if (!lockRows[0]?.acquired) {
      console.log('[db:migrate] Another migration runner holds the lock. Exiting.');
      return;
    }

    // Create tracking table if it does not exist yet.
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
        id          serial       PRIMARY KEY,
        filename    text         NOT NULL UNIQUE,
        checksum    text         NOT NULL,
        applied_at  timestamptz  NOT NULL DEFAULT now()
      )
    `);

    // Fetch already-applied filenames.
    const { rows: appliedRows } = await client.query<{ filename: string }>(
      `SELECT filename FROM ${TRACKING_TABLE}`,
    );
    const appliedSet = new Set(appliedRows.map((r) => r.filename));

    // Read and sort: numbered files (0001_…) come first lexically, then others.
    const allFiles = await readdir(MIGRATIONS_DIR);
    const sqlFiles = allFiles.filter((f) => f.endsWith('.sql')).sort();

    let appliedCount = 0;
    let skippedCount = 0;

    for (const filename of sqlFiles) {
      if (appliedSet.has(filename)) {
        skippedCount += 1;
        console.log(`[db:migrate] Skip (already applied): ${filename}`);
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, filename);
      const sql = await readFile(filePath, 'utf-8');
      const checksum = createHash('sha256').update(sql).digest('hex');

      console.log(`[db:migrate] Applying: ${filename}`);

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(`INSERT INTO ${TRACKING_TABLE} (filename, checksum) VALUES ($1, $2)`, [
          filename,
          checksum,
        ]);
        await client.query('COMMIT');
        appliedCount += 1;
        console.log(`[db:migrate] Applied:  ${filename}`);
      } catch (err) {
        await client.query('ROLLBACK');

        if (WARN_ON_FAILURE.has(filename)) {
          // Gracefully skip files whose SQL is environment-specific (e.g. role grants).
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(
            `[db:migrate] Warning: ${filename} failed (environment may not support it): ${msg}. Marking as applied.`,
          );
          // Record it so it is not re-attempted on every boot.
          await client.query(
            `INSERT INTO ${TRACKING_TABLE} (filename, checksum) VALUES ($1, $2)
             ON CONFLICT (filename) DO NOTHING`,
            [filename, checksum],
          );
          appliedCount += 1;
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`[db:migrate] Failed to apply ${filename}: ${msg}`);
        }
      }
    }

    console.log(`[db:migrate] Complete. Applied: ${appliedCount}, Skipped: ${skippedCount}`);
  } finally {
    // Always release the advisory lock before disconnecting.
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    await client.end();
  }
}

run().catch((err) => {
  console.error('[db:migrate] Fatal error:', err);
  process.exit(1);
});

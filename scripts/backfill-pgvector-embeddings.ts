/**
 * backfill-pgvector-embeddings.ts
 *
 * Startup backfill script: converts any face_embeddings rows where embedding_vec
 * IS NULL (i.e. written before the pgvector migration) by reading their JSON
 * `embedding` column and writing it into the new `embedding_vec` vector column.
 * Then recomputes centroids for every employee touched.
 *
 * Safety properties:
 *  - Uses a Postgres advisory lock (pg_try_advisory_xact_lock) so only one
 *    instance runs at a time; safe across horizontal replica restarts.
 *  - Chunked updates (CHUNK_SIZE rows per batch) avoid long-running transactions.
 *  - Fully idempotent: rows already converted are skipped (WHERE embedding_vec IS NULL).
 *  - Exits with code 0 on success (including when there is nothing to do).
 *
 * Run via:  npm run face:vec:backfill
 */

import { config as loadEnv } from 'dotenv';

const CHUNK_SIZE = 200;
// Arbitrary stable lock key: crc32('face-vec-backfill') as a bigint-safe integer
const ADVISORY_LOCK_KEY = 1_782_349_021;

type StaleRow = {
  id: string;
  tenantId: string;
  employeeProfileId: string;
  modelKey: string;
  embedding: number[];
};

async function run(): Promise<void> {
  const { prisma } = await import('../src/lib/db/prisma');
  const { recomputeEmployeeCentroid } = await import('../src/lib/camera/centroidService');

  let totalConverted = 0;
  const affectedEmployeeKeys = new Set<string>();

  while (true) {
    // Grab the advisory lock inside each chunk transaction so other instances back off.
    const acquired = await prisma.$queryRaw<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(${ADVISORY_LOCK_KEY}) AS acquired
    `;
    if (!acquired[0]?.acquired) {
      console.log('[vec-backfill] Another instance holds the advisory lock. Exiting.');
      return;
    }

    // Fetch the next chunk of un-converted rows.
    const rows = await prisma.$queryRaw<StaleRow[]>`
      SELECT
        id,
        tenant_id            AS "tenantId",
        employee_profile_id  AS "employeeProfileId",
        model_key            AS "modelKey",
        embedding
      FROM face_embeddings
      WHERE embedding_vec IS NULL
        AND active = true
      ORDER BY created_at ASC
      LIMIT ${CHUNK_SIZE}
    `;

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      const values: number[] = Array.isArray(row.embedding)
        ? row.embedding.map(Number).filter(Number.isFinite)
        : [];

      if (values.length === 0) {
        console.warn(`[vec-backfill] Skipping row ${row.id}: no usable embedding values`);
        continue;
      }

      // L2-normalise in JS (same logic as normalizeEmbeddingVector).
      const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
      const normalised = norm > 0 ? values.map((v) => v / norm) : values;
      const vecLiteral = `[${normalised.join(',')}]`;

      await prisma.$executeRaw`
        UPDATE face_embeddings
        SET
          embedding_vec = ${vecLiteral}::vector(512),
          updated_at    = now()
        WHERE id = ${row.id}::uuid
          AND embedding_vec IS NULL
      `;

      affectedEmployeeKeys.add(`${row.tenantId}::${row.employeeProfileId}::${row.modelKey}`);
      totalConverted += 1;
    }

    console.log(`[vec-backfill] Converted chunk; running total: ${totalConverted}`);
  }

  console.log(`[vec-backfill] Embedding conversion complete. Total converted: ${totalConverted}`);

  // Recompute centroids for every affected employee.
  let centroidsRebuilt = 0;
  for (const key of affectedEmployeeKeys) {
    const [tenantId, employeeProfileId, modelKey] = key.split('::');
    if (!tenantId || !employeeProfileId || !modelKey) continue;

    const sampleCount = await recomputeEmployeeCentroid(tenantId, employeeProfileId, modelKey);
    if (sampleCount > 0) {
      centroidsRebuilt += 1;
    }
  }

  console.log(`[vec-backfill] Centroids rebuilt: ${centroidsRebuilt}`);

  // Reconcile: find employees that have active embedding_vec but no centroid row.
  // This covers cases where the centroid table was cleared after a previous backfill,
  // a fresh deployment, or any run where totalConverted = 0 (nothing to convert but
  // centroids may still be absent).
  type OrphanedCombo = { tenantId: string; employeeProfileId: string; modelKey: string };
  const orphaned = await prisma.$queryRaw<OrphanedCombo[]>`
    SELECT DISTINCT
      fe.tenant_id             AS "tenantId",
      fe.employee_profile_id   AS "employeeProfileId",
      fe.model_key             AS "modelKey"
    FROM face_embeddings fe
    WHERE fe.active = true
      AND fe.embedding_vec IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM face_employee_centroids c
        WHERE c.tenant_id           = fe.tenant_id
          AND c.employee_profile_id = fe.employee_profile_id
          AND c.model_key           = fe.model_key
      )
  `;

  let reconciledCount = 0;
  for (const row of orphaned) {
    const sampleCount = await recomputeEmployeeCentroid(
      row.tenantId,
      row.employeeProfileId,
      row.modelKey,
    );
    if (sampleCount > 0) reconciledCount += 1;
  }

  if (reconciledCount > 0) {
    console.log(`[vec-backfill] Reconciled missing centroids: ${reconciledCount}`);
  } else {
    console.log('[vec-backfill] All centroids already present — nothing to reconcile.');
  }
}

async function main(): Promise<void> {
  loadEnv({ path: '.env.local' });
  loadEnv();

  await run();
}

main().catch((error) => {
  console.error('[vec-backfill] Fatal error:', error);
  process.exit(1);
});

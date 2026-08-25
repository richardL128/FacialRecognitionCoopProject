/**
 * centroidService.ts
 *
 * Helpers for maintaining per-employee centroid vectors in face_employee_centroids.
 * A centroid is the L2-normalised mean of all active embedding_vec values for one
 * employee + model combination.  It is the fast Stage-A target in the centroid-first
 * recognition pipeline.
 *
 * All SQL is raw because Prisma has no native support for the pgvector `vector` type.
 */

import { prisma } from '@/lib/db/prisma';

/**
 * Recompute and upsert the centroid for one (tenant, employee, modelKey) triple.
 *
 * Uses Postgres' built-in vector arithmetic:
 *   avg of normalised vectors → re-normalise → store
 *
 * Safe to call multiple times; idempotent when embeddings have not changed.
 * No-ops when there are no active embedding_vec rows yet.
 *
 * Returns the number of samples used (0 if nothing to do).
 */
export async function recomputeEmployeeCentroid(
  tenantId: string,
  employeeProfileId: string,
  modelKey: string,
): Promise<number> {
  type CentroidRow = { sampleCount: number };
  const rows = await prisma.$queryRaw<CentroidRow[]>`
    WITH active_vecs AS (
      SELECT embedding_vec
      FROM face_embeddings
      WHERE tenant_id            = ${tenantId}::uuid
        AND employee_profile_id  = ${employeeProfileId}::uuid
        AND model_key             = ${modelKey}
        AND active                = true
        AND embedding_vec        IS NOT NULL
    ),
    averaged AS (
      SELECT
        count(*)                               AS sample_count,
        avg(embedding_vec)::vector(512)        AS mean_vec
      FROM active_vecs
    )
    INSERT INTO face_employee_centroids (
      tenant_id,
      employee_profile_id,
      model_key,
      centroid_vec,
      sample_count,
      created_at,
      updated_at
    )
    SELECT
      ${tenantId}::uuid,
      ${employeeProfileId}::uuid,
      ${modelKey},
      -- L2-normalise the mean vector using pgvector helper.
      l2_normalize(mean_vec)::vector(512),
      sample_count,
      now(),
      now()
    FROM averaged
    WHERE sample_count > 0
    ON CONFLICT (tenant_id, employee_profile_id, model_key)
    DO UPDATE SET
      centroid_vec  = EXCLUDED.centroid_vec,
      sample_count  = EXCLUDED.sample_count,
      updated_at    = now()
    RETURNING sample_count AS "sampleCount"
  `;

  return Number(rows[0]?.sampleCount ?? 0);
}

/**
 * Delete the centroid for one employee + model when all their embeddings become inactive.
 */
export async function removeEmployeeCentroid(
  tenantId: string,
  employeeProfileId: string,
  modelKey: string,
): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM face_employee_centroids
    WHERE tenant_id            = ${tenantId}::uuid
      AND employee_profile_id  = ${employeeProfileId}::uuid
      AND model_key             = ${modelKey}
  `;
}

/**
 * Stage-A query: return all centroids for a tenant+model, ordered by cosine
 * distance to the probe embedding (closest first).
 *
 * Returns up to `limit` rows; cosine similarity = 1 - cosine_distance.
 */
export type CentroidScanRow = {
  employeeProfileId: string;
  centroidSimilarity: number;
  sampleCount: number;
};

export async function scanCentroidsForProbe(
  tenantId: string,
  modelKey: string,
  probeVecLiteral: string, // Postgres vector literal, e.g. '[0.1,0.2,...]'
  limit: number,
): Promise<CentroidScanRow[]> {
  return prisma.$queryRaw<CentroidScanRow[]>`
    SELECT
      employee_profile_id               AS "employeeProfileId",
      sample_count                      AS "sampleCount",
      1 - (centroid_vec <=> ${probeVecLiteral}::vector(512))   AS "centroidSimilarity"
    FROM face_employee_centroids
    WHERE tenant_id  = ${tenantId}::uuid
      AND model_key  = ${modelKey}
    ORDER BY centroid_vec <=> ${probeVecLiteral}::vector(512)
    LIMIT ${limit}
  `;
}

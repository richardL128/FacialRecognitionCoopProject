import { prisma } from '@/lib/db/prisma';
import { recomputeEmployeeCentroid, removeEmployeeCentroid } from '@/lib/camera/centroidService';

export type FaceEmbeddingJobStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export type FaceEmbeddingJobRow = {
  id: string;
  tenantId: string;
  employeeProfileId: string;
  captureId: string;
  requestedBy: string | null;
  modelKey: string;
  status: FaceEmbeddingJobStatus;
  reason: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function getEmbeddingModelKey(): string {
  const configured = process.env.FACE_EMBEDDING_MODEL_KEY?.trim();
  return configured && configured.length > 0 ? configured : 'embedding-v1-wrn101';
}

export async function enqueueEmployeeFaceEmbeddingJob(
  tenantId: string,
  employeeProfileId: string,
  captureId: string,
  requestedBy: string | null,
  reason: string,
): Promise<{ enqueued: boolean; jobId: string }> {
  const modelKey = getEmbeddingModelKey();

  const inserted = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO face_embedding_jobs (
      tenant_id,
      employee_profile_id,
      capture_id,
      requested_by,
      model_key,
      status,
      reason,
      created_at,
      updated_at
    )
    SELECT
      ${tenantId}::uuid,
      ${employeeProfileId}::uuid,
      ${captureId}::uuid,
      ${requestedBy}::uuid,
      ${modelKey},
      'pending',
      ${reason},
      now(),
      now()
    WHERE NOT EXISTS (
      SELECT 1
      FROM face_embedding_jobs
      WHERE capture_id = ${captureId}::uuid
        AND model_key = ${modelKey}
        AND status IN ('pending', 'running')
    )
    RETURNING id
  `;

  const insertedJob = inserted[0];
  if (insertedJob) {
    return { enqueued: true, jobId: insertedJob.id };
  }

  const existing = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM face_embedding_jobs
    WHERE capture_id = ${captureId}::uuid
      AND model_key = ${modelKey}
      AND status IN ('pending', 'running')
    ORDER BY created_at ASC
    LIMIT 1
  `;

  return {
    enqueued: false,
    jobId: existing[0]?.id ?? '',
  };
}

export async function claimNextPendingEmbeddingJob(): Promise<FaceEmbeddingJobRow | null> {
  const modelKey = getEmbeddingModelKey();

  const rows = await prisma.$queryRaw<FaceEmbeddingJobRow[]>`
    WITH next_job AS (
      SELECT id
      FROM face_embedding_jobs
      WHERE status = 'pending'
        AND model_key = ${modelKey}
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE face_embedding_jobs job
    SET
      status = 'running',
      started_at = now(),
      updated_at = now()
    FROM next_job
    WHERE job.id = next_job.id
    RETURNING
      job.id,
      job.tenant_id AS "tenantId",
      job.employee_profile_id AS "employeeProfileId",
      job.capture_id AS "captureId",
      job.requested_by AS "requestedBy",
      job.model_key AS "modelKey",
      job.status,
      job.reason,
      job.error_message AS "errorMessage",
      job.started_at AS "startedAt",
      job.finished_at AS "finishedAt",
      job.created_at AS "createdAt",
      job.updated_at AS "updatedAt"
  `;

  return rows[0] ?? null;
}

export async function upsertFaceEmbedding(params: {
  tenantId: string;
  employeeProfileId: string;
  captureId: string;
  modelKey: string;
  embedding: number[];
}): Promise<void> {
  // Build the Postgres vector literal from the normalised float array.
  const vecLiteral = `[${params.embedding.join(',')}]`;

  // Guard: only write (and only re-activate) when the capture is still linked in
  // employee_face_library.  This closes two races:
  //   1. Photo removed before the embedding worker ran → INSERT produces 0 rows, no ghost embedding.
  //   2. Photo removed after embedding was written but before the worker ran again →
  //      ON CONFLICT leaves `active` as-is (false) instead of unconditionally flipping it to true.
  await prisma.$executeRaw`
    INSERT INTO face_embeddings (
      tenant_id,
      employee_profile_id,
      capture_id,
      model_key,
      embedding_dim,
      embedding,
      embedding_vec,
      active,
      created_at,
      updated_at
    )
    SELECT
      ${params.tenantId}::uuid,
      ${params.employeeProfileId}::uuid,
      ${params.captureId}::uuid,
      ${params.modelKey},
      ${params.embedding.length},
      ${JSON.stringify(params.embedding)}::jsonb,
      ${vecLiteral}::vector(512),
      true,
      now(),
      now()
    WHERE EXISTS (
      SELECT 1 FROM employee_face_library
      WHERE capture_id = ${params.captureId}::uuid
    )
    ON CONFLICT (capture_id, model_key)
    DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      employee_profile_id = EXCLUDED.employee_profile_id,
      embedding_dim = EXCLUDED.embedding_dim,
      embedding = EXCLUDED.embedding,
      embedding_vec = EXCLUDED.embedding_vec,
      active = CASE
        WHEN EXISTS (
          SELECT 1 FROM employee_face_library
          WHERE capture_id = EXCLUDED.capture_id
        ) THEN true
        ELSE face_embeddings.active
      END,
      updated_at = now()
  `;

  // Keep centroid in sync after each successful write.
  await recomputeEmployeeCentroid(params.tenantId, params.employeeProfileId, params.modelKey);
}

export async function deactivateFaceEmbeddingForCapture(
  captureId: string,
  modelKey = getEmbeddingModelKey(),
): Promise<void> {
  type AffectedRow = { tenantId: string; employeeProfileId: string };
  const affected = await prisma.$queryRaw<AffectedRow[]>`
    UPDATE face_embeddings
    SET active = false, updated_at = now()
    WHERE capture_id = ${captureId}::uuid
      AND model_key = ${modelKey}
      AND active = true
    RETURNING tenant_id AS "tenantId", employee_profile_id AS "employeeProfileId"
  `;

  // Recompute or remove the centroid for every employee affected by this deactivation.
  for (const row of affected) {
    type CountRow = { remaining: number };
    const countRows = await prisma.$queryRaw<CountRow[]>`
      SELECT count(*) AS remaining
      FROM face_embeddings
      WHERE tenant_id            = ${row.tenantId}::uuid
        AND employee_profile_id  = ${row.employeeProfileId}::uuid
        AND model_key             = ${modelKey}
        AND active                = true
        AND embedding_vec        IS NOT NULL
    `;
    const remaining = Number(countRows[0]?.remaining ?? 0);
    if (remaining > 0) {
      await recomputeEmployeeCentroid(row.tenantId, row.employeeProfileId, modelKey);
    } else {
      await removeEmployeeCentroid(row.tenantId, row.employeeProfileId, modelKey);
    }
  }
}

export async function markEmbeddingJobSucceeded(jobId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE face_embedding_jobs
    SET
      status = 'succeeded',
      error_message = NULL,
      finished_at = now(),
      updated_at = now()
    WHERE id = ${jobId}::uuid
  `;
}

export async function markEmbeddingJobFailed(jobId: string, errorMessage: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE face_embedding_jobs
    SET
      status = 'failed',
      error_message = ${errorMessage},
      finished_at = now(),
      updated_at = now()
    WHERE id = ${jobId}::uuid
  `;
}

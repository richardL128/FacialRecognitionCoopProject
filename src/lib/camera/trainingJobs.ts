import path from 'node:path';
import { prisma } from '@/lib/db/prisma';
import { getTrainingDataDirForTenant } from '@/lib/camera/trainingDataset';

export type TrainingJobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';

export type FaceModelTrainingJobRow = {
  id: string;
  tenantId: string;
  requestedBy: string | null;
  status: TrainingJobStatus;
  reason: string | null;
  dataDir: string | null;
  outputDir: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TrainingCompletionPayload = {
  dataDir: string;
  outputDir: string;
  modelPath: string;
  checkpointPath: string | null;
  datasetClassCount: number;
  datasetImageCount: number;
  trainEpochs: number;
  valAccuracy: number | null;
};

export function getTrainingOutputRoot(): string {
  const configured = process.env.FACE_TRAINING_OUTPUT_ROOT?.trim();
  if (configured && configured.length > 0) {
    return configured;
  }

  return path.join(process.cwd(), 'checkpoints');
}

export function getTrainingOutputDirForTenant(tenantId: string): string {
  return path.join(getTrainingOutputRoot(), tenantId);
}

export async function enqueueTenantTrainingJob(
  tenantId: string,
  requestedBy: string | null,
  reason: string,
): Promise<{ enqueued: boolean; jobId: string }> {
  const dataDir = getTrainingDataDirForTenant(tenantId);
  const outputDir = getTrainingOutputDirForTenant(tenantId);

  const inserted = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO face_model_training_jobs (
      tenant_id,
      requested_by,
      status,
      reason,
      data_dir,
      output_dir,
      metadata,
      created_at,
      updated_at
    )
    SELECT
      ${tenantId}::uuid,
      ${requestedBy}::uuid,
      'pending',
      ${reason},
      ${dataDir},
      ${outputDir},
      jsonb_build_object('source', 'employee_face_library', 'triggerReason', ${reason}),
      now(),
      now()
    WHERE NOT EXISTS (
      SELECT 1
      FROM face_model_training_jobs
      WHERE tenant_id = ${tenantId}::uuid
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
    FROM face_model_training_jobs
    WHERE tenant_id = ${tenantId}::uuid
      AND status IN ('pending', 'running')
    ORDER BY created_at ASC
    LIMIT 1
  `;

  return {
    enqueued: false,
    jobId: existing[0]?.id ?? '',
  };
}

export async function claimNextPendingTrainingJob(): Promise<FaceModelTrainingJobRow | null> {
  const rows = await prisma.$queryRaw<FaceModelTrainingJobRow[]>`
    WITH next_job AS (
      SELECT id
      FROM face_model_training_jobs
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE face_model_training_jobs job
    SET
      status = 'running',
      started_at = now(),
      updated_at = now()
    FROM next_job
    WHERE job.id = next_job.id
    RETURNING
      job.id,
      job.tenant_id AS "tenantId",
      job.requested_by AS "requestedBy",
      job.status,
      job.reason,
      job.data_dir AS "dataDir",
      job.output_dir AS "outputDir",
      job.started_at AS "startedAt",
      job.finished_at AS "finishedAt",
      job.error_message AS "errorMessage",
      job.created_at AS "createdAt",
      job.updated_at AS "updatedAt"
  `;

  return rows[0] ?? null;
}

export async function markTrainingJobFailed(jobId: string, errorMessage: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE face_model_training_jobs
    SET
      status = 'failed',
      finished_at = now(),
      error_message = ${errorMessage},
      updated_at = now()
    WHERE id = ${jobId}::uuid
  `;
}

export async function markTrainingJobSkipped(jobId: string, reason: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE face_model_training_jobs
    SET
      status = 'skipped',
      finished_at = now(),
      error_message = ${reason},
      updated_at = now()
    WHERE id = ${jobId}::uuid
  `;
}

export async function markTrainingJobSucceeded(
  job: FaceModelTrainingJobRow,
  payload: TrainingCompletionPayload,
): Promise<void> {
  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE face_model_training_jobs
      SET
        status = 'succeeded',
        finished_at = now(),
        data_dir = ${payload.dataDir},
        output_dir = ${payload.outputDir},
        error_message = NULL,
        metadata = jsonb_build_object(
          'datasetClassCount', ${payload.datasetClassCount},
          'datasetImageCount', ${payload.datasetImageCount},
          'trainEpochs', ${payload.trainEpochs},
          'valAccuracy', ${payload.valAccuracy}
        ),
        updated_at = now()
      WHERE id = ${job.id}::uuid
    `,
    prisma.$executeRaw`
      INSERT INTO face_model_versions (
        tenant_id,
        source_job_id,
        model_path,
        checkpoint_path,
        data_dir,
        dataset_class_count,
        dataset_image_count,
        train_epochs,
        val_accuracy,
        created_at
      )
      VALUES (
        ${job.tenantId}::uuid,
        ${job.id}::uuid,
        ${payload.modelPath},
        ${payload.checkpointPath},
        ${payload.dataDir},
        ${payload.datasetClassCount},
        ${payload.datasetImageCount},
        ${payload.trainEpochs},
        ${payload.valAccuracy},
        now()
      )
    `,
  ]);
}

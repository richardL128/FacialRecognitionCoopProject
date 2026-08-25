import { NextResponse } from 'next/server';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getDatabaseStartupConfigError } from '@/lib/db/prisma';
import { classifyDatabaseError } from '@/lib/db/error-classifier';
import { getEmbeddingModelKey } from '@/lib/camera/embeddingJobs';
import { getFaceRecognizerBaseUrl } from '@/lib/camera/embeddingService';
import { requestLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/types/api';

export const runtime = 'nodejs';

type RelationCheckRow = {
  employeeProfiles: string | null;
  employeeFaceLibrary: string | null;
  faceEmbeddingJobs: string | null;
  faceEmployeeCentroids: string | null;
};

type EmbeddingHealthRow = {
  queuePending: number | string | null;
  queueRunning: number | string | null;
  queueFailed: number | string | null;
  queueLagSeconds: number | string | null;
  employeesWithPhotos: number | string | null;
  employeesWithCentroids: number | string | null;
};

function asMetric(value: number | string | null | undefined): number {
  const metric = Number(value ?? 0);
  return Number.isFinite(metric) ? metric : 0;
}

async function checkRecognizerHealth(): Promise<'ok' | 'unreachable'> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`${getFaceRecognizerBaseUrl()}/health`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
    return response.ok ? 'ok' : 'unreachable';
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const requestId = crypto.randomUUID();
  const log = requestLogger({ method: 'GET', path: '/api/health/ready', requestId });

  const databaseConfigError = getDatabaseStartupConfigError();
  if (databaseConfigError) {
    const response = NextResponse.json(
      apiError('DATABASE_URL_INVALID', databaseConfigError, {
        requestId,
        context: 'GET /api/health/ready',
      }),
      { status: 500 },
    );
    response.headers.set('x-request-id', requestId);
    return response;
  }

  try {
    await prisma.$queryRaw(Prisma.sql`SELECT 1`);

    const relationRows = await prisma.$queryRaw<RelationCheckRow[]>(Prisma.sql`
      SELECT
        to_regclass('public.employee_profiles')::text AS "employeeProfiles",
        to_regclass('public.employee_face_library')::text AS "employeeFaceLibrary",
        to_regclass('public.face_embedding_jobs')::text AS "faceEmbeddingJobs",
        to_regclass('public.face_employee_centroids')::text AS "faceEmployeeCentroids"
    `);

    const relationInfo = relationRows[0] ?? {
      employeeProfiles: null,
      employeeFaceLibrary: null,
      faceEmbeddingJobs: null,
      faceEmployeeCentroids: null,
    };

    const employeeSchemaReady =
      relationInfo.employeeProfiles !== null && relationInfo.employeeFaceLibrary !== null;
    const recognizerSchemaReady =
      relationInfo.faceEmbeddingJobs !== null && relationInfo.faceEmployeeCentroids !== null;

    const modelKey = getEmbeddingModelKey();
    const recognizerHealth = await checkRecognizerHealth();

    const embeddingHealthRows = recognizerSchemaReady
      ? await prisma.$queryRaw<EmbeddingHealthRow[]>(Prisma.sql`
            SELECT
              count(*) FILTER (WHERE fej.status = 'pending') AS "queuePending",
              count(*) FILTER (WHERE fej.status = 'running') AS "queueRunning",
              count(*) FILTER (WHERE fej.status = 'failed') AS "queueFailed",
              COALESCE(
                extract(epoch FROM now() - min(fej.created_at)) FILTER (WHERE fej.status = 'pending'),
                0
              ) AS "queueLagSeconds",
              (
                SELECT count(DISTINCT efl.employee_profile_id)
                FROM employee_face_library efl
              ) AS "employeesWithPhotos",
              (
                SELECT count(DISTINCT fec.employee_profile_id)
                FROM face_employee_centroids fec
                WHERE fec.model_key = ${modelKey}
              ) AS "employeesWithCentroids"
            FROM face_embedding_jobs fej
            WHERE fej.model_key = ${modelKey}
          `)
      : [];

    const embeddingHealth = embeddingHealthRows[0];
    const queuePending = asMetric(embeddingHealth?.queuePending);
    const queueRunning = asMetric(embeddingHealth?.queueRunning);
    const queueFailed = asMetric(embeddingHealth?.queueFailed);
    const queueLagSeconds = asMetric(embeddingHealth?.queueLagSeconds);
    const employeesWithPhotos = asMetric(embeddingHealth?.employeesWithPhotos);
    const employeesWithCentroids = asMetric(embeddingHealth?.employeesWithCentroids);
    const centroidCoverage =
      employeesWithPhotos > 0
        ? Number((employeesWithCentroids / employeesWithPhotos).toFixed(4))
        : 1;

    const recognizerReady = recognizerHealth === 'ok' && recognizerSchemaReady;
    const overallReady = employeeSchemaReady && recognizerReady;

    const response = NextResponse.json(
      apiSuccess({
        status: overallReady ? 'ready' : 'degraded',
        checks: {
          database: 'ok',
          employeeSchema: employeeSchemaReady ? 'ok' : 'missing',
          recognizer: recognizerHealth,
          recognizerSchema: recognizerSchemaReady ? 'ok' : 'missing',
        },
        recognizer: {
          modelKey,
          queue: {
            pending: queuePending,
            running: queueRunning,
            failed: queueFailed,
            lagSeconds: queueLagSeconds,
          },
          centroids: {
            employeesWithPhotos,
            employeesWithCentroids,
            coverage: centroidCoverage,
          },
        },
      }),
      { status: overallReady ? 200 : 503 },
    );

    response.headers.set('x-request-id', requestId);
    return response;
  } catch (error) {
    const classified = classifyDatabaseError(error, 'health.ready');
    log.error({ err: error, classified }, 'Readiness check failed');

    const response = NextResponse.json(
      apiError(classified.code, classified.message, {
        requestId,
        ...classified.details,
      }),
      { status: classified.status },
    );

    response.headers.set('x-request-id', requestId);
    return response;
  }
}

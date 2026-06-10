import { NextResponse } from 'next/server';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getDatabaseStartupConfigError } from '@/lib/db/prisma';
import { classifyDatabaseError } from '@/lib/db/error-classifier';
import { requestLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/types/api';

export const runtime = 'nodejs';

type RelationCheckRow = {
  employeeProfiles: string | null;
  employeeFaceLibrary: string | null;
};

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
        to_regclass('public.employee_face_library')::text AS "employeeFaceLibrary"
    `);

    const relationInfo = relationRows[0] ?? {
      employeeProfiles: null,
      employeeFaceLibrary: null,
    };

    const employeeSchemaReady =
      relationInfo.employeeProfiles !== null && relationInfo.employeeFaceLibrary !== null;

    const response = NextResponse.json(
      apiSuccess({
        status: employeeSchemaReady ? 'ready' : 'degraded',
        checks: {
          database: 'ok',
          employeeSchema: employeeSchemaReady ? 'ok' : 'missing',
        },
      }),
      { status: employeeSchemaReady ? 200 : 503 },
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

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { withApi } from '@/lib/api/handler';
import { auditLog } from '@/lib/audit/logger';
import { prisma } from '@/lib/db/prisma';
import { classifyDatabaseError } from '@/lib/db/error-classifier';
import { requestLogger } from '@/lib/logger';
import { canUser } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/types/api';

export const runtime = 'nodejs';

const createEmployeeSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320).optional(),
});

type EmployeeRow = {
  id: string;
  firstName: string;
  name: string;
  email: string | null;
  active: boolean;
  createdAt: Date;
  photoCount: bigint;
  hasPin: boolean;
};

export const GET = withApi(
  async (request: NextRequest, { session, requestId }) => {
    const log = requestLogger({
      method: request.method,
      path: request.nextUrl.pathname,
      tenantId: session.tenantId,
      userId: session.userId,
      requestId,
    });

    if (!canUser(session, 'employee:database:read')) {
      return NextResponse.json(apiError('FORBIDDEN', 'Insufficient permissions'), { status: 403 });
    }

    const search = request.nextUrl.searchParams.get('q')?.trim() ?? '';
    const limitRaw = Number(request.nextUrl.searchParams.get('limit') ?? '100');
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 100;
    const hasSearch = search.length > 0;
    const likePattern = `%${search}%`;

    let rows: EmployeeRow[] = [];
    try {
      rows = await prisma.$queryRaw<EmployeeRow[]>(Prisma.sql`
        SELECT
          ep.id,
          ep.first_name AS "firstName",
          ep.name,
          ep.email,
          ep.active,
          ep.created_at AS "createdAt",
          COUNT(efl.id) AS "photoCount",
          (ep.pin_code IS NOT NULL AND length(ep.pin_code) > 0) AS "hasPin"
        FROM employee_profiles ep
        LEFT JOIN employee_face_library efl ON efl.employee_profile_id = ep.id
        WHERE ep.tenant_id = ${session.tenantId}::uuid
          AND (
            ${hasSearch} = false
            OR ep.first_name ILIKE ${likePattern}
            OR ep.name ILIKE ${likePattern}
            OR COALESCE(ep.email, '') ILIKE ${likePattern}
          )
        GROUP BY ep.id, ep.first_name, ep.name, ep.email, ep.active, ep.created_at, ep.pin_code
        ORDER BY ep.created_at DESC
        LIMIT ${limit}
      `);
    } catch (error) {
      const classified = classifyDatabaseError(error, 'feature-a.employees.get');
      log.error({ err: error, classified }, 'Employee database GET failed');

      return NextResponse.json(
        apiError(classified.code, classified.message, {
          requestId,
          ...classified.details,
        }),
        {
          status: classified.status,
        },
      );
    }

    return NextResponse.json(
      apiSuccess({
        employees: rows.map((row) => ({
          id: row.id,
          firstName: row.firstName,
          name: row.name,
          email: row.email,
          active: row.active,
          createdAt: row.createdAt,
          photoCount: Number(row.photoCount),
          hasPin: Boolean(row.hasPin),
        })),
      }),
      { status: 200 },
    );
  },
  {
    featureFlag: 'module:feature-a',
  },
);

export const POST = withApi(
  async (request: NextRequest, { session, requestId }) => {
    const log = requestLogger({
      method: request.method,
      path: request.nextUrl.pathname,
      tenantId: session.tenantId,
      userId: session.userId,
      requestId,
    });

    if (!canUser(session, 'employee:database:manage')) {
      return NextResponse.json(apiError('FORBIDDEN', 'Insufficient permissions'), { status: 403 });
    }

    const body = await request.json();
    const parsed = createEmployeeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiError('VALIDATION_ERROR', 'Invalid employee payload', parsed.error.flatten()),
        { status: 400 },
      );
    }

    const name = parsed.data.name.trim();
    const email = parsed.data.email?.trim() || null;
    const firstName = '';

    let inserted: Array<{ id: string }> = [];
    try {
      inserted = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO employee_profiles (tenant_id, first_name, name, email, created_at, updated_at)
        VALUES (${session.tenantId}::uuid, ${firstName}, ${name}, ${email}, now(), now())
        RETURNING id
      `);
    } catch (error) {
      const classified = classifyDatabaseError(error, 'feature-a.employees.post');
      log.error({ err: error, classified }, 'Employee database POST failed');

      return NextResponse.json(
        apiError(classified.code, classified.message, {
          requestId,
          ...classified.details,
        }),
        {
          status: classified.status,
        },
      );
    }

    const created = inserted[0];
    if (!created) {
      return NextResponse.json(apiError('INTERNAL_ERROR', 'Unable to create employee'), {
        status: 500,
      });
    }

    await auditLog({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'employee.profile.created',
      entityType: 'EmployeeProfile',
      entityId: created.id,
      afterData: {
        name,
        email,
      },
      request,
    });

    return NextResponse.json(apiSuccess({ id: created.id }), { status: 201 });
  },
  {
    featureFlag: 'module:feature-a',
  },
);

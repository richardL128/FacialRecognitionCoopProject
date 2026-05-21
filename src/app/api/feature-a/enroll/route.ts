import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { withApi } from '@/lib/api/handler';
import { auditLog } from '@/lib/audit/logger';
import { prisma } from '@/lib/db/prisma';
import { canUser } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/types/api';

export const runtime = 'nodejs';

const enrollSchema = z.object({
  employeeId: z.string().uuid(),
  captureId: z.string().uuid(),
});

type ExistenceRow = { id: string };

export const POST = withApi(
  async (request: NextRequest, { session }) => {
    if (!canUser(session, 'employee:database:manage')) {
      return NextResponse.json(apiError('FORBIDDEN', 'Insufficient permissions'), { status: 403 });
    }

    const body = await request.json();
    const parsed = enrollSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiError('VALIDATION_ERROR', 'Invalid enrollment payload', parsed.error.flatten()),
        { status: 400 },
      );
    }

    const employeeRows = await prisma.$queryRaw<ExistenceRow[]>(Prisma.sql`
      SELECT id
      FROM employee_profiles
      WHERE id = ${parsed.data.employeeId}::uuid
        AND tenant_id = ${session.tenantId}::uuid
      LIMIT 1
    `);
    if (!employeeRows[0]) {
      return NextResponse.json(apiError('NOT_FOUND', 'Employee not found'), { status: 404 });
    }

    const captureRows = await prisma.$queryRaw<ExistenceRow[]>(Prisma.sql`
      SELECT id
      FROM camera_captures
      WHERE id = ${parsed.data.captureId}::uuid
        AND tenant_id = ${session.tenantId}::uuid
      LIMIT 1
    `);
    if (!captureRows[0]) {
      return NextResponse.json(apiError('NOT_FOUND', 'Capture not found'), { status: 404 });
    }

    const inserted = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO employee_face_library (tenant_id, employee_profile_id, capture_id, created_by)
      VALUES (
        ${session.tenantId}::uuid,
        ${parsed.data.employeeId}::uuid,
        ${parsed.data.captureId}::uuid,
        ${session.userId}::uuid
      )
      ON CONFLICT ON CONSTRAINT uq_employee_face_profile_capture DO NOTHING
      RETURNING id
    `);

    const enrolled = inserted[0];
    if (!enrolled) {
      return NextResponse.json(
        apiError('CONFLICT', 'Capture is already enrolled for this employee'),
        {
          status: 409,
        },
      );
    }

    await auditLog({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'employee.face.enrolled',
      entityType: 'EmployeeFaceLibrary',
      entityId: enrolled.id,
      afterData: {
        employeeId: parsed.data.employeeId,
        captureId: parsed.data.captureId,
      },
      request,
    });

    return NextResponse.json(apiSuccess({ id: enrolled.id }), { status: 201 });
  },
  {
    featureFlag: 'module:feature-a',
  },
);

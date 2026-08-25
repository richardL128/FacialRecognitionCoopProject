import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { withApi } from '@/lib/api/handler';
import { auditLog } from '@/lib/audit/logger';
import { hashPin, verifyPin } from '@/lib/auth/pinHash';
import { isValidPin, sanitizePinInput } from '@/lib/auth/pinSanitization';
import { prisma } from '@/lib/db/prisma';
import { classifyDatabaseError } from '@/lib/db/error-classifier';
import { requestLogger } from '@/lib/logger';
import { canUser } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/types/api';

export const runtime = 'nodejs';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const pinSchema = z.object({
  pinCode: z.union([z.string(), z.null()]).describe('4-6 digit numeric PIN, or null to clear'),
});

export const PATCH = withApi(
  async (request: NextRequest, { session, params, requestId }) => {
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

    const parsedParams = paramsSchema.safeParse(params);
    if (!parsedParams.success) {
      return NextResponse.json(apiError('VALIDATION_ERROR', 'Invalid employee id'), {
        status: 400,
      });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = pinSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiError('VALIDATION_ERROR', 'Invalid PIN payload', parsed.error.flatten()),
        { status: 400 },
      );
    }

    const employeeId = parsedParams.data.id;
    const newPin =
      typeof parsed.data.pinCode === 'string' ? sanitizePinInput(parsed.data.pinCode) : null;

    if (newPin !== null && !isValidPin(newPin)) {
      return NextResponse.json(apiError('VALIDATION_ERROR', 'PIN must be 4 to 6 digits'), {
        status: 400,
      });
    }

    const hashedPin = newPin ? await hashPin(newPin) : null;

    try {
      const existing = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM employee_profiles
        WHERE id = ${employeeId}::uuid AND tenant_id = ${session.tenantId}::uuid
        LIMIT 1
      `);

      if (existing.length === 0) {
        return NextResponse.json(apiError('NOT_FOUND', 'Employee not found'), { status: 404 });
      }

      if (newPin) {
        const candidates = await prisma.$queryRaw<
          Array<{ id: string; pinCode: string }>
        >(Prisma.sql`
          SELECT id, pin_code AS "pinCode" FROM employee_profiles
          WHERE tenant_id = ${session.tenantId}::uuid
            AND pin_code IS NOT NULL
            AND id <> ${employeeId}::uuid
        `);

        for (const candidate of candidates) {
          if (await verifyPin(newPin, candidate.pinCode)) {
            return NextResponse.json(
              apiError('PIN_TAKEN', 'That PIN is already assigned to another employee.'),
              { status: 409 },
            );
          }
        }
      }

      await prisma.$executeRaw(Prisma.sql`
        UPDATE employee_profiles
        SET pin_code = ${hashedPin}, updated_at = now()
        WHERE id = ${employeeId}::uuid AND tenant_id = ${session.tenantId}::uuid
      `);
    } catch (error) {
      const classified = classifyDatabaseError(error, 'feature-a.employees.pin.patch');
      log.error({ err: error, classified }, 'Employee PIN update failed');
      return NextResponse.json(
        apiError(classified.code, classified.message, { requestId, ...classified.details }),
        { status: classified.status },
      );
    }

    await auditLog({
      tenantId: session.tenantId,
      userId: session.userId,
      action: newPin ? 'employee.pin.set' : 'employee.pin.cleared',
      entityType: 'EmployeeProfile',
      entityId: employeeId,
      afterData: { hasPin: Boolean(newPin) },
      request,
    });

    return NextResponse.json(apiSuccess({ id: employeeId, hasPin: Boolean(newPin) }), {
      status: 200,
    });
  },
  {
    featureFlag: 'module:feature-a',
  },
);

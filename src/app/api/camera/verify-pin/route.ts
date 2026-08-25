import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { withApi } from '@/lib/api/handler';
import { auditLog } from '@/lib/audit/logger';
import { hashPin, isHashedPin, verifyPin } from '@/lib/auth/pinHash';
import { isValidPin, sanitizePinInput } from '@/lib/auth/pinSanitization';
import { prisma } from '@/lib/db/prisma';
import { requestLogger } from '@/lib/logger';
import { canUser } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/types/api';

export const runtime = 'nodejs';

const bodySchema = z.object({
  pinCode: z.string(),
});

type EmployeeRow = {
  id: string;
  firstName: string;
  name: string;
  email: string | null;
  pinCode: string;
};

export const POST = withApi(
  async (request: NextRequest, { session, requestId }) => {
    const log = requestLogger({
      method: request.method,
      path: request.nextUrl.pathname,
      tenantId: session.tenantId,
      userId: session.userId,
      requestId,
    });

    if (!canUser(session, 'camera:capture:read')) {
      return NextResponse.json(apiError('FORBIDDEN', 'Insufficient permissions'), { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        apiError('VALIDATION_ERROR', 'PIN must be 4 to 6 digits', parsed.error.flatten()),
        { status: 400 },
      );
    }

    const pin = sanitizePinInput(parsed.data.pinCode);
    if (!isValidPin(pin)) {
      return NextResponse.json(apiError('VALIDATION_ERROR', 'PIN must be 4 to 6 digits'), {
        status: 400,
      });
    }

    let rows: EmployeeRow[] = [];
    try {
      rows = await prisma.$queryRaw<EmployeeRow[]>(Prisma.sql`
        SELECT id, first_name AS "firstName", name, email, pin_code AS "pinCode"
        FROM employee_profiles
        WHERE tenant_id = ${session.tenantId}::uuid
          AND active = true
          AND pin_code IS NOT NULL
          AND length(pin_code) > 0
      `);
    } catch (error) {
      log.error({ err: error }, 'PIN verification query failed');
      return NextResponse.json(apiError('INTERNAL_ERROR', 'PIN verification failed'), {
        status: 500,
      });
    }

    const matchedRows: EmployeeRow[] = [];
    for (const row of rows) {
      if (await verifyPin(pin, row.pinCode)) {
        matchedRows.push(row);
      }
      if (matchedRows.length > 1) {
        break;
      }
    }

    if (matchedRows.length !== 1) {
      await auditLog({
        tenantId: session.tenantId,
        userId: session.userId,
        action: 'camera.pin.verify.failed',
        entityType: 'EmployeeProfile',
        entityId: session.userId,
        afterData: { matched: false, ambiguous: matchedRows.length > 1 },
        request,
      });
      return NextResponse.json(apiError('PIN_INVALID', 'Incorrect PIN. Please try again.'), {
        status: 401,
      });
    }

    const match = matchedRows[0]!;

    if (!isHashedPin(match.pinCode)) {
      try {
        const upgradedPin = await hashPin(pin);
        await prisma.$executeRaw(Prisma.sql`
          UPDATE employee_profiles
          SET pin_code = ${upgradedPin}, updated_at = now()
          WHERE id = ${match.id}::uuid AND tenant_id = ${session.tenantId}::uuid
        `);
      } catch (error) {
        log.warn({ err: error, employeeId: match.id }, 'Failed to upgrade legacy PIN hash');
      }
    }

    await auditLog({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'camera.pin.verify.success',
      entityType: 'EmployeeProfile',
      entityId: match.id,
      afterData: { matched: true },
      request,
    });

    return NextResponse.json(
      apiSuccess({
        employeeId: match.id,
        firstName: match.firstName,
        displayName: match.name,
        email: match.email,
      }),
      { status: 200 },
    );
  },
  {
    featureFlag: 'CAMERA_CAPTURE_ENABLED',
  },
);

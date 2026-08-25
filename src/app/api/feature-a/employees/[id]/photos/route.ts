import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { withApi } from '@/lib/api/handler';
import { auditLog } from '@/lib/audit/logger';
import { enqueueEmployeeFaceEmbeddingJob } from '@/lib/camera/embeddingJobs';
import { enqueueTenantTrainingJob } from '@/lib/camera/trainingJobs';
import { syncEmployeeCaptureToTrainingDataset } from '@/lib/camera/trainingDataset';
import { classifyDatabaseError } from '@/lib/db/error-classifier';
import { prisma } from '@/lib/db/prisma';
import { canUser } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/types/api';

export const runtime = 'nodejs';

const MIN_PHOTOS_FOR_RECOGNITION = 3;

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export const GET = withApi(
  async (_request: NextRequest, { session, params }) => {
    if (!canUser(session, 'employee:database:read')) {
      return NextResponse.json(apiError('FORBIDDEN', 'Insufficient permissions'), { status: 403 });
    }

    const parsedParams = paramsSchema.safeParse(params);
    if (!parsedParams.success) {
      return NextResponse.json(apiError('VALIDATION_ERROR', 'Invalid employee id'), {
        status: 400,
      });
    }

    const employeeId = parsedParams.data.id;

    const employee = await prisma.employeeProfile.findFirst({
      where: { id: employeeId, tenantId: session.tenantId, active: true },
      select: { id: true },
    });

    if (!employee) {
      return NextResponse.json(apiError('NOT_FOUND', 'Employee not found'), { status: 404 });
    }

    const photos = await prisma.employeeFaceLibrary.findMany({
      where: { employeeProfileId: employeeId, tenantId: session.tenantId },
      select: {
        id: true,
        captureId: true,
        createdAt: true,
        capture: { select: { imageUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(
      apiSuccess({
        photos: photos.map((p) => ({
          id: p.id,
          captureId: p.captureId,
          imageUrl: p.capture.imageUrl,
          createdAt: p.createdAt,
        })),
      }),
      { status: 200 },
    );
  },
  { featureFlag: 'module:feature-a' },
);

const bodySchema = z.object({
  captureId: z.string().uuid(),
});

export const POST = withApi(
  async (request: NextRequest, { session, params, requestId }) => {
    if (!canUser(session, 'employee:database:manage')) {
      return NextResponse.json(apiError('FORBIDDEN', 'Insufficient permissions'), { status: 403 });
    }

    const parsedParams = paramsSchema.safeParse(params);
    if (!parsedParams.success) {
      return NextResponse.json(apiError('VALIDATION_ERROR', 'Invalid employee id'), {
        status: 400,
      });
    }

    let requestBody: unknown;
    try {
      requestBody = await request.json();
    } catch {
      return NextResponse.json(apiError('VALIDATION_ERROR', 'Invalid JSON payload'), {
        status: 400,
      });
    }

    const payload = bodySchema.safeParse(requestBody);
    if (!payload.success) {
      return NextResponse.json(
        apiError('VALIDATION_ERROR', 'Invalid photo enrollment payload', payload.error.flatten()),
        { status: 400 },
      );
    }

    const employeeId = parsedParams.data.id;
    const { captureId } = payload.data;

    const currentUser = await prisma.user.findFirst({
      where: {
        id: session.userId,
        tenantId: session.tenantId,
      },
      select: {
        id: true,
      },
    });

    if (!currentUser) {
      return NextResponse.json(
        apiError(
          'UNAUTHORIZED',
          'Session user is invalid for this tenant. Re-seed users and ensure DEV_BYPASS_EXTERNAL_ID points to a seeded user.',
          { requestId },
        ),
        { status: 401 },
      );
    }

    const [employee, capture] = await Promise.all([
      prisma.employeeProfile.findFirst({
        where: {
          id: employeeId,
          tenantId: session.tenantId,
          active: true,
        },
        select: {
          id: true,
          name: true,
        },
      }),
      prisma.cameraCapture.findFirst({
        where: {
          id: captureId,
          tenantId: session.tenantId,
        },
        select: {
          id: true,
        },
      }),
    ]);

    if (!employee) {
      return NextResponse.json(apiError('NOT_FOUND', 'Employee not found'), { status: 404 });
    }

    if (!capture) {
      return NextResponse.json(apiError('NOT_FOUND', 'Capture not found'), { status: 404 });
    }

    try {
      const enrolled = await prisma.employeeFaceLibrary.create({
        data: {
          tenantId: session.tenantId,
          employeeProfileId: employee.id,
          captureId,
          createdBy: session.userId,
        },
        select: {
          id: true,
          createdAt: true,
        },
      });

      await auditLog({
        tenantId: session.tenantId,
        userId: session.userId,
        action: 'EMPLOYEE_PHOTO_ENROLLED',
        entityType: 'EmployeeProfile',
        entityId: employee.id,
        afterData: {
          employeeId: employee.id,
          employeeName: employee.name,
          captureId,
          employeeFaceLibraryId: enrolled.id,
        },
        request,
      });

      try {
        await syncEmployeeCaptureToTrainingDataset(session.tenantId, employee.id, captureId);
      } catch (error) {
        console.warn('Failed to sync employee photo to training dataset', {
          tenantId: session.tenantId,
          employeeId: employee.id,
          captureId,
          error,
        });
      }

      let embeddingStatus: 'pending' | 'failed' = 'pending';
      let embeddingJobId: string | null = null;

      try {
        const enqueuedEmbeddingJob = await enqueueEmployeeFaceEmbeddingJob(
          session.tenantId,
          employee.id,
          captureId,
          session.userId,
          'employee_photo_enrolled',
        );
        embeddingJobId = enqueuedEmbeddingJob.jobId || null;
      } catch (error) {
        embeddingStatus = 'failed';
        console.warn('Failed to enqueue face embedding job after employee photo enrollment', {
          tenantId: session.tenantId,
          employeeId: employee.id,
          captureId,
          error,
        });
      }

      try {
        await enqueueTenantTrainingJob(session.tenantId, session.userId, 'employee_photo_enrolled');
      } catch (error) {
        console.warn('Failed to enqueue model training after employee photo enrollment', {
          tenantId: session.tenantId,
          employeeId: employee.id,
          captureId,
          error,
        });
      }

      const photoCount = await prisma.employeeFaceLibrary.count({
        where: { employeeProfileId: employee.id, tenantId: session.tenantId },
      });

      return NextResponse.json(
        apiSuccess({
          id: enrolled.id,
          captureId,
          employeeId: employee.id,
          createdAt: enrolled.createdAt,
          photoCount,
          readyForRecognition: photoCount >= MIN_PHOTOS_FOR_RECOGNITION,
          embeddingStatus,
          embeddingJobId,
          embeddingErrorCode: embeddingStatus === 'failed' ? 'EMBEDDING_JOB_FAILED' : null,
        }),
        { status: embeddingStatus === 'pending' ? 202 : 201 },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return NextResponse.json(
          apiError('ALREADY_EXISTS', 'This photo is already linked to this employee'),
          { status: 409 },
        );
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        return NextResponse.json(
          apiError(
            'INVALID_REFERENCE',
            'Unable to link photo due to invalid tenant/user/photo reference. Verify seeded users and captures for current tenant.',
            { requestId },
          ),
          { status: 400 },
        );
      }

      const classified = classifyDatabaseError(error, 'feature-a.employees.photos.post');
      return NextResponse.json(
        apiError(classified.code, classified.message, {
          requestId,
          ...classified.details,
        }),
        { status: classified.status },
      );
    }
  },
  {
    featureFlag: 'module:feature-a',
  },
);

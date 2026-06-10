import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApi } from '@/lib/api/handler';
import { auditLog } from '@/lib/audit/logger';
import { deactivateFaceEmbeddingForCapture } from '@/lib/camera/embeddingJobs';
import { enqueueTenantTrainingJob } from '@/lib/camera/trainingJobs';
import { removeEmployeeCaptureFromTrainingDataset } from '@/lib/camera/trainingDataset';
import { classifyDatabaseError } from '@/lib/db/error-classifier';
import { prisma } from '@/lib/db/prisma';
import { canUser } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const paramsSchema = z.object({
  id: z.string().uuid(),
  photoId: z.string().uuid(),
});

export const DELETE = withApi(
  async (request: NextRequest, { session, params, requestId }) => {
    if (!canUser(session, 'employee:database:manage')) {
      return NextResponse.json(apiError('FORBIDDEN', 'Insufficient permissions'), { status: 403 });
    }

    const parsedParams = paramsSchema.safeParse(params);
    if (!parsedParams.success) {
      return NextResponse.json(apiError('VALIDATION_ERROR', 'Invalid employee or photo id'), {
        status: 400,
      });
    }

    const { id: employeeId, photoId } = parsedParams.data;

    const photo = await prisma.employeeFaceLibrary.findFirst({
      where: {
        id: photoId,
        employeeProfileId: employeeId,
        tenantId: session.tenantId,
      },
      select: {
        id: true,
        captureId: true,
        employeeProfile: { select: { name: true } },
      },
    });

    if (!photo) {
      return NextResponse.json(apiError('NOT_FOUND', 'Photo link not found'), { status: 404 });
    }

    try {
      await prisma.employeeFaceLibrary.delete({
        where: { id: photoId },
      });

      await auditLog({
        tenantId: session.tenantId,
        userId: session.userId,
        action: 'EMPLOYEE_PHOTO_REMOVED',
        entityType: 'EmployeeProfile',
        entityId: employeeId,
        beforeData: {
          employeeId,
          employeeName: photo.employeeProfile.name,
          captureId: photo.captureId,
          employeeFaceLibraryId: photo.id,
        },
        request,
      });

      try {
        await removeEmployeeCaptureFromTrainingDataset(
          session.tenantId,
          employeeId,
          photo.captureId,
        );
      } catch (error) {
        console.warn('Failed to remove employee photo from training dataset', {
          tenantId: session.tenantId,
          employeeId,
          captureId: photo.captureId,
          error,
        });
      }

      try {
        await deactivateFaceEmbeddingForCapture(photo.captureId);
      } catch (error) {
        console.warn('Failed to deactivate face embedding after employee photo removal', {
          tenantId: session.tenantId,
          employeeId,
          captureId: photo.captureId,
          error,
        });
      }

      try {
        await enqueueTenantTrainingJob(session.tenantId, session.userId, 'employee_photo_removed');
      } catch (error) {
        console.warn('Failed to enqueue model training after employee photo removal', {
          tenantId: session.tenantId,
          employeeId,
          captureId: photo.captureId,
          error,
        });
      }

      return NextResponse.json(apiSuccess({ id: photoId }), { status: 200 });
    } catch (error) {
      const classified = classifyDatabaseError(error, 'feature-a.employees.photos.delete');
      return NextResponse.json(
        apiError(classified.code, classified.message, { requestId, ...classified.details }),
        { status: classified.status },
      );
    }
  },
  { featureFlag: 'module:feature-a' },
);

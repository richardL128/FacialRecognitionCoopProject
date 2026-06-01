import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApi } from '@/lib/api/handler';
import { auditLog } from '@/lib/audit/logger';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { canUser } from '@/lib/permissions';
import { sanitizeImageUpload } from '@/lib/camera/sanitize';
import { buildCaptureImageUrl, writeCaptureImage } from '@/lib/camera/storage';
import { apiError, apiSuccess } from '@/types/api';

export const runtime = 'nodejs';

const formDataSchema = z.object({
  image: z.instanceof(File),
});

export const POST = withApi(
  async (request: NextRequest, { session }) => {
    const formData = await request.formData();
    const parsed = formDataSchema.safeParse({
      image: formData.get('image'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        apiError('VALIDATION_ERROR', 'A valid image file is required', parsed.error.flatten()),
        { status: 400 },
      );
    }

    if (!canUser(session, 'camera:capture:create')) {
      return NextResponse.json(apiError('FORBIDDEN', 'Insufficient permissions'), { status: 403 });
    }

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
      return NextResponse.json(apiError('NOT_FOUND', 'User not found'), { status: 404 });
    }

    const rawFile = parsed.data.image;
    const rawBuffer = Buffer.from(await rawFile.arrayBuffer());

    const sanitizedImage = await sanitizeImageUpload(rawBuffer, rawFile.type);

    const captureId = randomUUID();
    const imageUrl = buildCaptureImageUrl(captureId);

    await writeCaptureImage(session.tenantId, captureId, sanitizedImage.buffer);

    await prisma.cameraCapture.create({
      data: {
        id: captureId,
        tenantId: session.tenantId,
        userId: session.userId,
        imageUrl,
      },
    });

    const captureLimit = 10;
    try {
      const oldest = await prisma.cameraCapture.findMany({
        where: {
          tenantId: session.tenantId,
          employeeFaceLibrary: {
            none: {},
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: captureLimit,
        select: { id: true },
      });

      if (oldest.length > 0) {
        await prisma.cameraCapture.deleteMany({
          where: { id: { in: oldest.map((c) => c.id) } },
        });
      }
    } catch (error) {
      logger.warn(
        { err: error, tenantId: session.tenantId },
        'Failed to prune old camera captures after upload',
      );
    }

    await auditLog({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'CAMERA_CAPTURE_UPLOADED',
      entityType: 'CameraCapture',
      entityId: captureId,
      afterData: {
        sanitized: true,
        mimeType: sanitizedImage.mimeType,
      },
      request,
    });

    return NextResponse.json(
      apiSuccess({
        captureId,
        imageUrl,
      }),
      { status: 201 },
    );
  },
  {
    featureFlag: 'CAMERA_CAPTURE_ENABLED',
  },
);

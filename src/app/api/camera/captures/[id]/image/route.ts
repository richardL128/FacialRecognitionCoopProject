import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApi } from '@/lib/api/handler';
import { belongsToTenant } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { canUser } from '@/lib/permissions';
import { readCaptureImage } from '@/lib/camera/storage';
import { apiError } from '@/types/api';

export const runtime = 'nodejs';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export const GET = withApi(
  async (_request: NextRequest, { session, params }) => {
    const parsedParams = paramsSchema.safeParse(params);
    if (!parsedParams.success) {
      return NextResponse.json(apiError('VALIDATION_ERROR', 'Invalid capture id'), { status: 400 });
    }

    if (!canUser(session, 'camera:capture:read')) {
      return NextResponse.json(apiError('FORBIDDEN', 'Insufficient permissions'), { status: 403 });
    }

    const capture = await prisma.cameraCapture.findUnique({
      where: { id: parsedParams.data.id },
      select: {
        id: true,
        tenantId: true,
      },
    });

    if (!capture) {
      return NextResponse.json(apiError('NOT_FOUND', 'Capture not found'), { status: 404 });
    }

    if (!belongsToTenant(session, capture.tenantId)) {
      return NextResponse.json(apiError('NOT_FOUND', 'Capture not found'), { status: 404 });
    }

    try {
      const imageBuffer = await readCaptureImage(capture.tenantId, capture.id);
      return new NextResponse(new Uint8Array(imageBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'private, max-age=300',
        },
      });
    } catch {
      return NextResponse.json(apiError('NOT_FOUND', 'Capture image not found'), { status: 404 });
    }
  },
  {
    featureFlag: 'CAMERA_CAPTURE_ENABLED',
  },
);

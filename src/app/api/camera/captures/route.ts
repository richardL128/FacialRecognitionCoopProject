import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApi } from '@/lib/api/handler';
import { prisma } from '@/lib/db/prisma';
import { canUser } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/types/api';

export const runtime = 'nodejs';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).optional(),
  cursor: z.string().uuid().optional(),
});

export const GET = withApi(
  async (request: NextRequest, { session }) => {
    if (!canUser(session, 'camera:capture:read')) {
      return NextResponse.json(apiError('FORBIDDEN', 'Insufficient permissions'), { status: 403 });
    }

    const parsedQuery = querySchema.safeParse({
      limit: new URL(request.url).searchParams.get('limit') ?? undefined,
      cursor: new URL(request.url).searchParams.get('cursor') ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        apiError('VALIDATION_ERROR', 'Invalid query parameters', parsedQuery.error.flatten()),
        { status: 400 },
      );
    }

    const limit = parsedQuery.data.limit ?? 8;
    const cursor = parsedQuery.data.cursor;

    const captures = await prisma.cameraCapture.findMany({
      where: {
        tenantId: session.tenantId,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
      take: limit + 1,
      select: {
        id: true,
        imageUrl: true,
        createdAt: true,
      },
    });

    const hasMore = captures.length > limit;
    const page = hasMore ? captures.slice(0, limit) : captures;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    return NextResponse.json(
      apiSuccess({
        captures: page,
        hasMore,
        nextCursor,
      }),
      { status: 200 },
    );
  },
  {
    featureFlag: 'CAMERA_CAPTURE_ENABLED',
  },
);

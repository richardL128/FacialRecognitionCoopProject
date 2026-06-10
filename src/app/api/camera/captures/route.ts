import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { withApi } from '@/lib/api/handler';
import { prisma } from '@/lib/db/prisma';
import { canUser } from '@/lib/permissions';
import { buildCaptureImageUrl } from '@/lib/camera/storage';
import { apiError, apiSuccess } from '@/types/api';

export const runtime = 'nodejs';

type RecognitionRow = {
  id: string;
  recognitionStatus: string | null;
  recognitionConfidence: number | null;
  recognizedAt: Date | null;
  employeeId: string | null;
  employeeName: string | null;
};

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

    // Step 1: Use Prisma findMany for cursor-based pagination (only stable schema fields).
    const captures = await prisma.cameraCapture.findMany({
      where: {
        tenantId: session.tenantId,
        source: 'dashboard',
        employeeFaceLibrary: { none: {} },
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
        createdAt: true,
      },
    });

    const hasMore = captures.length > limit;
    const page = hasMore ? captures.slice(0, limit) : captures;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    // Step 2: Fetch recognition metadata for this page via raw SQL so we don't depend
    // on Prisma client regeneration for the new columns.
    const recognitionMap = new Map<string, RecognitionRow>();
    if (page.length > 0) {
      const captureIds = page.map((c) => c.id);
      const rows = await prisma
        .$queryRaw<RecognitionRow[]>(
          Prisma.sql`
          SELECT
            cc.id,
            cc.recognition_status       AS "recognitionStatus",
            cc.recognition_confidence   AS "recognitionConfidence",
            cc.recognized_at            AS "recognizedAt",
            ep.id                       AS "employeeId",
            ep.name                     AS "employeeName"
          FROM camera_captures cc
          LEFT JOIN employee_profiles ep ON ep.id = cc.recognized_employee_id
          WHERE cc.id = ANY(SELECT unnest(${captureIds}::uuid[]))
        `,
        )
        .catch(() => [] as RecognitionRow[]);

      for (const row of rows) {
        recognitionMap.set(row.id, row);
      }
    }

    return NextResponse.json(
      apiSuccess({
        captures: page.map((capture) => {
          const rec = recognitionMap.get(capture.id);
          return {
            id: capture.id,
            createdAt: capture.createdAt,
            imageUrl: buildCaptureImageUrl(capture.id),
            recognition: rec?.recognitionStatus
              ? {
                  status: rec.recognitionStatus,
                  confidence: rec.recognitionConfidence,
                  recognizedAt: rec.recognizedAt,
                  employee:
                    rec.employeeId && rec.employeeName
                      ? { id: rec.employeeId, name: rec.employeeName }
                      : null,
                }
              : null,
          };
        }),
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

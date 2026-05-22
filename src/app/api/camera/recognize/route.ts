import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { withApi } from '@/lib/api/handler';
import { auditLog } from '@/lib/audit/logger';
import { prisma } from '@/lib/db/prisma';
import { canUser } from '@/lib/permissions';
import { sanitizeImageUpload } from '@/lib/camera/sanitize';
import { readCaptureImage } from '@/lib/camera/storage';
import {
  computeDHash,
  findBestRecognitionMatch,
  type RecognitionCandidate,
} from '@/lib/camera/recognition';
import { apiError, apiSuccess } from '@/types/api';

export const runtime = 'nodejs';

const CANDIDATE_LIMIT = 120;
const MIN_CANDIDATES = 3;
const MIN_CONFIDENCE = 0.82;
const formDataSchema = z.object({
  image: z.instanceof(File),
  excludeCaptureId: z.string().uuid().optional(),
});

export const POST = withApi(
  async (request: NextRequest, { session }) => {
    const formData = await request.formData();
    const parsed = formDataSchema.safeParse({
      image: formData.get('image'),
      excludeCaptureId: formData.get('excludeCaptureId') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        apiError('VALIDATION_ERROR', 'A valid image file is required', parsed.error.flatten()),
        { status: 400 },
      );
    }

    if (!canUser(session, 'camera:capture:read')) {
      return NextResponse.json(apiError('FORBIDDEN', 'Insufficient permissions'), { status: 403 });
    }

    const rawFile = parsed.data.image;
    const rawBuffer = Buffer.from(await rawFile.arrayBuffer());
    const sanitizedImage = await sanitizeImageUpload(rawBuffer, rawFile.type);
    const probeHash = await computeDHash(sanitizedImage.buffer);

    type LibraryCandidateRow = {
      captureId: string;
      employeeId: string;
      employeeEmail: string | null;
      employeeName: string;
      employeeFirstName: string;
    };

    let captureCandidates: LibraryCandidateRow[] = [];
    try {
      captureCandidates = await prisma.$queryRaw<LibraryCandidateRow[]>(Prisma.sql`
        SELECT
          efl.capture_id AS "captureId",
          ep.id AS "employeeId",
          ep.email AS "employeeEmail",
          ep.name AS "employeeName",
          ep.first_name AS "employeeFirstName"
        FROM employee_face_library efl
        JOIN employee_profiles ep ON ep.id = efl.employee_profile_id
        WHERE efl.tenant_id = ${session.tenantId}::uuid
          AND ep.active = true
          ${parsed.data.excludeCaptureId ? Prisma.sql`AND efl.capture_id <> ${parsed.data.excludeCaptureId}::uuid` : Prisma.sql``}
        ORDER BY efl.created_at DESC
        LIMIT ${CANDIDATE_LIMIT}
      `);
    } catch (error) {
      // Log database query error but continue with empty candidates
      captureCandidates = [];
    }

    const hashedCandidates: Array<{ candidate: RecognitionCandidate; hash: bigint }> = [];

    for (const capture of captureCandidates) {
      try {
        const candidateBuffer = await readCaptureImage(session.tenantId, capture.captureId);
        const candidateHash = await computeDHash(candidateBuffer);

        hashedCandidates.push({
          candidate: {
            captureId: capture.captureId,
            userId: capture.employeeId,
            userEmail: capture.employeeEmail ?? `${capture.employeeFirstName}@employee.local`,
            displayName: capture.employeeName,
          },
          hash: candidateHash,
        });
      } catch {
        // Ignore candidates whose files cannot be read.
      }
    }

    const recognition = findBestRecognitionMatch(probeHash, hashedCandidates, 10);
    const hasMinimumCandidates = recognition.candidatesEvaluated >= MIN_CANDIDATES;
    const isConfidentMatch =
      recognition.matched &&
      !!recognition.best &&
      recognition.best.confidence >= MIN_CONFIDENCE &&
      hasMinimumCandidates;

    const status = isConfidentMatch
      ? 'matched'
      : hasMinimumCandidates
        ? 'no_match'
        : 'insufficient_data';

    await auditLog({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'CAMERA_CAPTURE_RECOGNIZED',
      entityType: 'CameraCapture',
      entityId: recognition.best?.candidate.captureId ?? session.userId,
      afterData: {
        matched: isConfidentMatch,
        status,
        confidence: recognition.best?.confidence ?? null,
        distance: recognition.best?.distance ?? null,
        candidateUserId: recognition.best?.candidate.userId ?? null,
        candidatesEvaluated: recognition.candidatesEvaluated,
        algorithm: 'dhash-v1',
        minCandidates: MIN_CANDIDATES,
        minConfidence: MIN_CONFIDENCE,
      },
      request,
    });

    return NextResponse.json(
      apiSuccess({
        matched: isConfidentMatch,
        status,
        confidence: recognition.best?.confidence ?? null,
        distance: recognition.best?.distance ?? null,
        candidatesEvaluated: recognition.candidatesEvaluated,
        match:
          isConfidentMatch && recognition.best
            ? {
                captureId: recognition.best.candidate.captureId,
                userId: recognition.best.candidate.userId,
                email: recognition.best.candidate.userEmail,
                displayName: recognition.best.candidate.displayName,
              }
            : null,
        thresholds: {
          minCandidates: MIN_CANDIDATES,
          minConfidence: MIN_CONFIDENCE,
        },
      }),
      { status: 200 },
    );
  },
  {
    featureFlag: 'CAMERA_CAPTURE_ENABLED',
  },
);

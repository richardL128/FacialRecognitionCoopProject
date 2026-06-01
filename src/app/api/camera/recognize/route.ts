import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { withApi } from '@/lib/api/handler';
import { auditLog } from '@/lib/audit/logger';
import { cosineSimilarity, getFaceEmbedding } from '@/lib/camera/embeddingService';
import { prisma } from '@/lib/db/prisma';
import { requestLogger } from '@/lib/logger';
import { canUser } from '@/lib/permissions';
import { sanitizeImageUpload } from '@/lib/camera/sanitize';
import { readCaptureImage } from '@/lib/camera/storage';
import { apiError, apiSuccess } from '@/types/api';

export const runtime = 'nodejs';

const CANDIDATE_LIMIT = Number(process.env.FACE_RECOGNITION_CANDIDATE_LIMIT ?? 120);
const MIN_CANDIDATES = 3;
const MIN_CONFIDENCE_EMBEDDING = Number(process.env.FACE_RECOGNIZER_MIN_CONFIDENCE ?? 0.75);
const EMBEDDING_AMBIGUITY_MARGIN = Number(process.env.FACE_RECOGNIZER_AMBIGUITY_MARGIN ?? 0.03);
const RECOGNITION_PROVIDER = 'embedding';
const formDataSchema = z.object({
  image: z.instanceof(File),
  excludeCaptureId: z.string().uuid().optional(),
});

type RecognitionCandidate = {
  captureId: string;
  userId: string;
  userEmail: string;
  displayName: string;
};

type RecognitionMatch = {
  candidate: RecognitionCandidate;
  confidence: number;
  distance: number;
};

type RecognitionResult =
  | {
      matched: true;
      best: RecognitionMatch;
      candidatesEvaluated: number;
    }
  | {
      matched: false;
      best: RecognitionMatch | null;
      candidatesEvaluated: number;
    };

type MatchTelemetry = {
  providerAttempted: 'embedding';
  algorithm: string;
  durationMs: number;
  candidatesRequested: number;
  candidatesEvaluated: number;
  candidateReadErrors: number;
  candidateComputeErrors: number;
  topConfidence: number | null;
  secondConfidence: number | null;
  confidenceGap: number | null;
};

type MatchPayload = {
  recognition: RecognitionResult;
  algorithm: string;
  telemetry: MatchTelemetry;
};

async function buildEmbeddingRecognition(
  probeBuffer: Buffer,
  captureCandidates: LibraryCandidateRow[],
  tenantId: string,
): Promise<MatchPayload> {
  const startedAt = Date.now();
  const probeEmbedding = await getFaceEmbedding(probeBuffer);
  const matches: Array<{
    candidate: RecognitionCandidate;
    confidence: number;
    distance: number;
  }> = [];
  let candidateReadErrors = 0;
  let candidateComputeErrors = 0;

  for (const capture of captureCandidates) {
    try {
      const candidateBuffer = await readCaptureImage(tenantId, capture.captureId);
      const candidateEmbedding = await getFaceEmbedding(candidateBuffer);
      const similarity = cosineSimilarity(probeEmbedding, candidateEmbedding);

      if (!Number.isFinite(similarity)) {
        continue;
      }

      matches.push({
        candidate: {
          captureId: capture.captureId,
          userId: capture.employeeId,
          userEmail: capture.employeeEmail ?? `${capture.employeeFirstName}@employee.local`,
          displayName: capture.employeeName,
        },
        confidence: Number(similarity.toFixed(4)),
        distance: Number((1 - similarity).toFixed(4)),
      });
    } catch {
      candidateReadErrors += 1;
      candidateComputeErrors += 1;
    }
  }

  if (matches.length === 0) {
    return {
      recognition: { matched: false, best: null, candidatesEvaluated: 0 },
      algorithm: 'embedding-v1-wrn101',
      telemetry: {
        providerAttempted: 'embedding',
        algorithm: 'embedding-v1-wrn101',
        durationMs: Date.now() - startedAt,
        candidatesRequested: captureCandidates.length,
        candidatesEvaluated: 0,
        candidateReadErrors,
        candidateComputeErrors,
        topConfidence: null,
        secondConfidence: null,
        confidenceGap: null,
      },
    };
  }

  const bestMatchByEmployee = new Map<string, (typeof matches)[number]>();
  for (const match of matches) {
    const existing = bestMatchByEmployee.get(match.candidate.userId);
    if (!existing || match.confidence > existing.confidence) {
      bestMatchByEmployee.set(match.candidate.userId, match);
    }
  }

  const sorted = [...bestMatchByEmployee.values()].sort((a, b) => b.confidence - a.confidence);
  const best = sorted[0] ?? null;
  const secondBest = sorted[1] ?? null;
  const isAboveThreshold = !!best && best.confidence >= MIN_CONFIDENCE_EMBEDDING;
  const isUnambiguous =
    !secondBest || (best?.confidence ?? 0) - secondBest.confidence >= EMBEDDING_AMBIGUITY_MARGIN;

  const topConfidence = best?.confidence ?? null;
  const secondConfidence = secondBest?.confidence ?? null;
  const confidenceGap =
    topConfidence !== null && secondConfidence !== null
      ? Number((topConfidence - secondConfidence).toFixed(4))
      : null;

  if (best && isAboveThreshold && isUnambiguous) {
    return {
      recognition: {
        matched: true,
        best,
        candidatesEvaluated: matches.length,
      },
      algorithm: 'embedding-v1-wrn101',
      telemetry: {
        providerAttempted: 'embedding',
        algorithm: 'embedding-v1-wrn101',
        durationMs: Date.now() - startedAt,
        candidatesRequested: captureCandidates.length,
        candidatesEvaluated: matches.length,
        candidateReadErrors,
        candidateComputeErrors,
        topConfidence,
        secondConfidence,
        confidenceGap,
      },
    };
  }

  return {
    recognition: {
      matched: false,
      best,
      candidatesEvaluated: matches.length,
    },
    algorithm: 'embedding-v1-wrn101',
    telemetry: {
      providerAttempted: 'embedding',
      algorithm: 'embedding-v1-wrn101',
      durationMs: Date.now() - startedAt,
      candidatesRequested: captureCandidates.length,
      candidatesEvaluated: matches.length,
      candidateReadErrors,
      candidateComputeErrors,
      topConfidence,
      secondConfidence,
      confidenceGap,
    },
  };
}

type LibraryCandidateRow = {
  captureId: string;
  employeeId: string;
  employeeEmail: string | null;
  employeeName: string;
  employeeFirstName: string;
};

export const POST = withApi(
  async (request: NextRequest, { session, requestId }) => {
    const routeLog = requestLogger({
      method: request.method,
      path: new URL(request.url).pathname,
      tenantId: session.tenantId,
      userId: session.userId,
      requestId,
    });

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
    } catch {
      captureCandidates = [];
    }

    let matchPayload: MatchPayload;
    const fallbackApplied = false;
    let fallbackReason: string | null = null;

    try {
      matchPayload = await buildEmbeddingRecognition(
        sanitizedImage.buffer,
        captureCandidates,
        session.tenantId,
      );
    } catch (error) {
      fallbackReason = error instanceof Error ? error.message : 'embedding_provider_error';
      const isNoFaceError = fallbackReason.toLowerCase().includes('no face detected');
      if (isNoFaceError) {
        return NextResponse.json(
          apiError('NO_FACE_DETECTED', 'No face detected. Please retake the photo.'),
          { status: 422 },
        );
      }

      matchPayload = {
        recognition: { matched: false, best: null, candidatesEvaluated: 0 },
        algorithm: 'embedding-v1-wrn101-error',
        telemetry: {
          providerAttempted: 'embedding',
          algorithm: 'embedding-v1-wrn101-error',
          durationMs: 0,
          candidatesRequested: captureCandidates.length,
          candidatesEvaluated: 0,
          candidateReadErrors: 0,
          candidateComputeErrors: 1,
          topConfidence: null,
          secondConfidence: null,
          confidenceGap: null,
        },
      };
    }

    const { recognition, algorithm, telemetry } = matchPayload;
    const minConfidence = MIN_CONFIDENCE_EMBEDDING;

    const hasMinimumCandidates = recognition.candidatesEvaluated >= MIN_CANDIDATES;
    const isConfidentMatch =
      recognition.matched &&
      !!recognition.best &&
      recognition.best.confidence >= minConfidence &&
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
        algorithm,
        providerConfigured: RECOGNITION_PROVIDER,
        fallbackApplied,
        fallbackReason,
        recognitionTelemetry: telemetry,
        minCandidates: MIN_CANDIDATES,
        minConfidence,
        minConfidenceEmbedding: MIN_CONFIDENCE_EMBEDDING,
        embeddingAmbiguityMargin: EMBEDDING_AMBIGUITY_MARGIN,
      },
      request,
    });

    routeLog.info(
      {
        algorithm,
        providerConfigured: RECOGNITION_PROVIDER,
        fallbackApplied,
        status,
        confidence: recognition.best?.confidence ?? null,
        candidatesEvaluated: recognition.candidatesEvaluated,
        telemetry,
      },
      'Face recognition decision',
    );

    return NextResponse.json(
      apiSuccess({
        matched: isConfidentMatch,
        status,
        confidence: recognition.best?.confidence ?? null,
        distance: recognition.best?.distance ?? null,
        candidatesEvaluated: recognition.candidatesEvaluated,
        topCandidate: recognition.best
          ? {
              captureId: recognition.best.candidate.captureId,
              userId: recognition.best.candidate.userId,
              email: recognition.best.candidate.userEmail,
              displayName: recognition.best.candidate.displayName,
              confidence: recognition.best.confidence,
              distance: recognition.best.distance,
            }
          : null,
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
          minConfidence,
          embeddingAmbiguityMargin: EMBEDDING_AMBIGUITY_MARGIN,
        },
      }),
      { status: 200 },
    );
  },
  {
    featureFlag: 'CAMERA_CAPTURE_ENABLED',
  },
);

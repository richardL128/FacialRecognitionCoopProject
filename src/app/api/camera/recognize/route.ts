import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { withApi } from '@/lib/api/handler';
import { auditLog } from '@/lib/audit/logger';
import {
  FaceEmbeddingError,
  getFaceEmbedding,
  normalizeEmbeddingVector,
  type FaceEmbeddingErrorCode,
} from '@/lib/camera/embeddingService';
import { getEmbeddingModelKey } from '@/lib/camera/embeddingJobs';
import { scanCentroidsForProbe } from '@/lib/camera/centroidService';
import { deriveRecognitionStatus, type EmployeeIndexState } from '@/lib/camera/recognitionStatus';
import { prisma } from '@/lib/db/prisma';
import { featureFlags } from '@/lib/feature-flags';
import { requestLogger } from '@/lib/logger';
import { canUser } from '@/lib/permissions';
import { sanitizeImageUpload } from '@/lib/camera/sanitize';
import { apiError, apiSuccess } from '@/types/api';

export const runtime = 'nodejs';

// How many candidate embeddings to fetch per employee in Stage B.
// The DB orders by cosine distance (HNSW) and returns the top-N closest vectors;
// we then score those in JS for the ambiguity check.
const CANDIDATE_LIMIT = Number(process.env.FACE_RECOGNITION_CANDIDATE_LIMIT ?? 120);

// Maximum cosine distance threshold for loading embeddings in Stage B.
// Embeddings farther than this from the probe are filtered at the SQL level
// using pgvector's <=> operator, so we never load irrelevant vectors into Node.js memory.
const MAX_COSINE_DISTANCE = Number(process.env.FACE_RECOGNITION_MAX_COSINE_DISTANCE ?? 0.35);
const MIN_CANDIDATES = 3;
const MIN_CONFIDENCE_EMBEDDING = Number(process.env.FACE_RECOGNIZER_MIN_CONFIDENCE ?? 0.75);
const EMBEDDING_AMBIGUITY_MARGIN = Number(process.env.FACE_RECOGNIZER_AMBIGUITY_MARGIN ?? 0.03);
// How many centroids to pull back in Stage A (should be >= total employee count; used as a safety cap).
const CENTROID_SCAN_LIMIT = Number(process.env.FACE_CENTROID_SCAN_LIMIT ?? 5000);
// Stage A shortlisting window: employees whose centroid similarity is within this margin of the
// best centroid are all reranked in Stage B.  Centroids are averages, so the correct employee is
// often only marginally behind the top centroid — a wide window lets Stage B rerank them on their
// actual per-capture photos (the accurate comparison) rather than trusting the centroid order.
// Override via FACE_CENTROID_SCAN_MARGIN env var.
const CENTROID_MARGIN = Number(process.env.FACE_CENTROID_SCAN_MARGIN ?? 0.1);
// Absolute minimum centroid similarity required before Stage B runs.
// This is only a coarse "is the probe plausibly any enrolled person" filter to avoid loading
// embeddings for completely unrelated faces. The real accept/reject decision is made in Stage B
// against individual photos (MIN_CONFIDENCE_EMBEDDING). A centroid is the *average* of an
// employee's embeddings, so it scores several points lower than the best single capture — keep
// this floor well below MIN_CONFIDENCE_EMBEDDING or correct faces get dropped before Stage B.
const MIN_CENTROID_SIMILARITY = Number(process.env.FACE_RECOGNIZER_MIN_CENTROID_SIMILARITY ?? 0.45);
const RECOGNITION_PROVIDER = 'centroid-first-vector-store';
const EMBEDDING_MODEL_KEY = getEmbeddingModelKey();
const formDataSchema = z.object({
  image: z.instanceof(File),
  excludeCaptureId: z.string().uuid().optional(),
  expectedEmployeeId: z.string().uuid().optional(),
});

// A failure to *ask* the question is not a negative *answer*. Every provider failure
// gets its own status and code so the client can tell "we looked and it isn't you"
// (200 + status:'no_match') apart from "we never managed to look" (4xx/5xx).
const FACE_EMBEDDING_ERROR_RESPONSES: Record<
  FaceEmbeddingErrorCode,
  { status: number; message: string }
> = {
  NO_FACE_DETECTED: {
    status: 422,
    message: 'No face detected. Please retake the photo.',
  },
  EMBEDDING_SERVICE_UNAVAILABLE: {
    status: 503,
    message: 'Face recognition is temporarily unavailable. Please try again shortly.',
  },
  EMBEDDING_SERVICE_FAILED: {
    status: 502,
    message: 'Face recognition could not process this photo. Please retake it.',
  },
};

/** Map a face-embedding provider failure onto its HTTP error response. */
function faceEmbeddingErrorResponse(error: FaceEmbeddingError): NextResponse {
  const mapped = FACE_EMBEDDING_ERROR_RESPONSES[error.code];
  return NextResponse.json(apiError(error.code, mapped.message), { status: mapped.status });
}

// ─── Shared types ────────────────────────────────────────────────────────────

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
  // Stage A
  centroidsScanned: number;
  centroidDurationMs: number;
  shortlistedEmployees: number;
  // Stage B
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

type EmployeeIndexStateRow = EmployeeIndexState & {
  employeeId: string;
};

async function getEmployeeIndexState(
  tenantId: string,
  employeeId: string,
): Promise<EmployeeIndexState | null> {
  const rows = await prisma.$queryRaw<EmployeeIndexStateRow[]>`
    SELECT
      ep.id AS "employeeId",
      (
        SELECT count(*)::int
        FROM employee_face_library efl
        WHERE efl.tenant_id = ep.tenant_id
          AND efl.employee_profile_id = ep.id
      ) AS "enrolledPhotoCount",
      (
        SELECT count(*)::int
        FROM face_embeddings fe
        WHERE fe.tenant_id = ep.tenant_id
          AND fe.employee_profile_id = ep.id
          AND fe.model_key = ${EMBEDDING_MODEL_KEY}
          AND fe.active = true
          AND fe.embedding_vec IS NOT NULL
      ) AS "activeEmbeddingCount",
      (
        SELECT count(*)::int
        FROM face_employee_centroids fec
        WHERE fec.tenant_id = ep.tenant_id
          AND fec.employee_profile_id = ep.id
          AND fec.model_key = ${EMBEDDING_MODEL_KEY}
          AND fec.sample_count > 0
      ) AS "centroidCount",
      (
        SELECT count(*)::int
        FROM face_embedding_jobs fej
        WHERE fej.tenant_id = ep.tenant_id
          AND fej.employee_profile_id = ep.id
          AND fej.model_key = ${EMBEDDING_MODEL_KEY}
          AND fej.status IN ('pending', 'running')
      ) AS "activeJobCount"
    FROM employee_profiles ep
    WHERE ep.id = ${employeeId}::uuid
      AND ep.tenant_id = ${tenantId}::uuid
      AND ep.active = true
    LIMIT 1
  `;

  const state = rows[0];
  if (!state) {
    return null;
  }

  return {
    enrolledPhotoCount: state.enrolledPhotoCount,
    activeEmbeddingCount: state.activeEmbeddingCount,
    centroidCount: state.centroidCount,
    activeJobCount: state.activeJobCount,
  };
}

// ─── Stage-B helpers (shared by centroid and legacy pipeline) ────────────────

type LibraryCandidateRow = {
  captureId: string;
  employeeId: string;
  employeeEmail: string | null;
  employeeName: string;
  employeeFirstName: string;
  embeddingDim: number | null;
  embedding: number[];
  cosineDistance: number; // pgvector <=> result — avoids redundant JS cosineSimilarity()
};

type IdentityEmbeddingVector = {
  captureId: string;
  embeddingDim: number | null;
  embedding: number[];
  cosineDistance: number; // pgvector <=> result — avoids redundant JS cosineSimilarity()
};

type IdentityEmbeddingEntry = {
  userId: string;
  userEmail: string;
  displayName: string;
  vectors: IdentityEmbeddingVector[];
};

type IdentityEmbeddingLibrary = Record<string, IdentityEmbeddingEntry>;

function buildIdentityEmbeddingLibrary(rows: LibraryCandidateRow[]): IdentityEmbeddingLibrary {
  const library: IdentityEmbeddingLibrary = {};

  for (const row of rows) {
    const existing = library[row.employeeId];
    if (!existing) {
      library[row.employeeId] = {
        userId: row.employeeId,
        userEmail: row.employeeEmail ?? `${row.employeeFirstName}@employee.local`,
        displayName: row.employeeName,
        vectors: [
          {
            captureId: row.captureId,
            embeddingDim: row.embeddingDim,
            embedding: row.embedding,
            cosineDistance: row.cosineDistance,
          },
        ],
      };
      continue;
    }
    existing.vectors.push({
      captureId: row.captureId,
      embeddingDim: row.embeddingDim,
      embedding: row.embedding,
      cosineDistance: row.cosineDistance,
    });
  }

  return library;
}

/**
 * Inner loop: compare probe embedding against every vector in an identity library.
 * Returns all matching vectors (not deduplicated per employee) so that the ambiguity
 * check in buildFinalResult can distinguish between same-identity high-confidence
 * matches (acceptable) and cross-identity ambiguity (reject).
 */
function scoreEmbeddingLibrary(
  probeEmbedding: number[],
  embeddingLibrary: IdentityEmbeddingLibrary,
): {
  matches: RecognitionMatch[];
  candidatesRequested: number;
  candidateReadErrors: number;
  candidateComputeErrors: number;
} {
  const matches: RecognitionMatch[] = [];
  let candidatesRequested = 0;
  let candidateReadErrors = 0;
  let candidateComputeErrors = 0;

  for (const entry of Object.values(embeddingLibrary)) {
    candidatesRequested += entry.vectors.length;
    let bestForIdentity: RecognitionMatch | null = null;

    for (const vector of entry.vectors) {
      try {
        if (!Array.isArray(vector.embedding) || vector.embedding.length === 0) {
          candidateComputeErrors += 1;
          continue;
        }
        if (vector.embeddingDim && vector.embeddingDim !== probeEmbedding.length) {
          candidateComputeErrors += 1;
          continue;
        }
        // Use the SQL-computed cosineDistance directly — no need to recompute in JS.
        const distance = Number(vector.cosineDistance);
        if (!Number.isFinite(distance)) {
          candidateComputeErrors += 1;
          continue;
        }
        // pgvector <=> returns cosine distance in [0, 2]; confidence = 1 - distance.
        const clampedDist = Math.max(0, Math.min(2, distance));
        const confidence = Number((1 - clampedDist).toFixed(4));
        const m: RecognitionMatch = {
          candidate: {
            captureId: vector.captureId,
            userId: entry.userId,
            userEmail: entry.userEmail,
            displayName: entry.displayName,
          },
          confidence,
          distance: Number(clampedDist.toFixed(4)),
        };
        if (!bestForIdentity || m.confidence > bestForIdentity.confidence) {
          bestForIdentity = m;
        }
        // Push every vector that meets the confidence threshold so that same-employee
        // high-confidence matches can occupy the top positions in the sorted list.
        // This lets buildFinalResult's ambiguity check correctly distinguish between
        // same-identity strong matches (acceptable) and cross-identity ambiguity (reject).
        if (confidence >= MIN_CONFIDENCE_EMBEDDING) {
          matches.push(m);
        }
      } catch {
        candidateReadErrors += 1;
        candidateComputeErrors += 1;
      }
    }

    // Push the best vector for this employee if it wasn't already added above
    // (i.e. it fell below the confidence threshold). buildFinalResult needs it
    // to populate the "best" field in the rejection telemetry.
    if (bestForIdentity && bestForIdentity.confidence < MIN_CONFIDENCE_EMBEDDING) {
      matches.push(bestForIdentity);
    }
  }

  return { matches, candidatesRequested, candidateReadErrors, candidateComputeErrors };
}

function buildFinalResult(
  matches: RecognitionMatch[],
  candidatesRequested: number,
  candidateReadErrors: number,
  candidateComputeErrors: number,
  startedAt: number,
  algorithm: string,
  centroidDurationMs: number,
  centroidsScanned: number,
  shortlistedEmployees: number,
): MatchPayload {
  if (matches.length === 0) {
    return {
      recognition: { matched: false, best: null, candidatesEvaluated: 0 },
      algorithm,
      telemetry: {
        providerAttempted: 'embedding',
        algorithm,
        durationMs: Date.now() - startedAt,
        centroidsScanned,
        centroidDurationMs,
        shortlistedEmployees,
        candidatesRequested,
        candidatesEvaluated: 0,
        candidateReadErrors,
        candidateComputeErrors,
        topConfidence: null,
        secondConfidence: null,
        confidenceGap: null,
      },
    };
  }

  const sorted = [...matches].sort((a, b) => b.confidence - a.confidence);
  const best = sorted[0] ?? null;
  const secondBest = sorted[1] ?? null;
  const isAboveThreshold = !!best && best.confidence >= MIN_CONFIDENCE_EMBEDDING;
  // Ambiguity only applies when the second-best candidate is a *different* employee.
  // If somehow the same userId appears twice (e.g. duplicate profiles), treat it as unambiguous.
  const secondBestIsDifferentUser =
    !!secondBest && secondBest.candidate.userId !== best?.candidate.userId;
  const isUnambiguous =
    !secondBestIsDifferentUser ||
    (best?.confidence ?? 0) - secondBest!.confidence >= EMBEDDING_AMBIGUITY_MARGIN;
  const topConfidence = best?.confidence ?? null;
  const secondConfidence = secondBest?.confidence ?? null;
  const confidenceGap =
    topConfidence !== null && secondConfidence !== null
      ? Number((topConfidence - secondConfidence).toFixed(4))
      : null;

  const baseTelemetry: MatchTelemetry = {
    providerAttempted: 'embedding',
    algorithm,
    durationMs: Date.now() - startedAt,
    centroidsScanned,
    centroidDurationMs,
    shortlistedEmployees,
    candidatesRequested,
    candidatesEvaluated: matches.length,
    candidateReadErrors,
    candidateComputeErrors,
    topConfidence,
    secondConfidence,
    confidenceGap,
  };

  if (best && isAboveThreshold && isUnambiguous) {
    return {
      recognition: { matched: true, best, candidatesEvaluated: matches.length },
      algorithm,
      telemetry: baseTelemetry,
    };
  }
  return {
    recognition: { matched: false, best, candidatesEvaluated: matches.length },
    algorithm,
    telemetry: baseTelemetry,
  };
}

// ─── Centroid-first pipeline (Stage A + Stage B) ─────────────────────────────

async function buildCentroidFirstRecognition(
  probeBuffer: Buffer,
  tenantId: string,
  excludeCaptureId: string | undefined,
): Promise<MatchPayload> {
  const startedAt = Date.now();
  const algorithm = `${EMBEDDING_MODEL_KEY}-centroid-first`;
  const probeEmbedding = normalizeEmbeddingVector(await getFaceEmbedding(probeBuffer));
  const probeVecLiteral = `[${probeEmbedding.join(',')}]`;

  // ── Stage A: centroid scan ───────────────────────────────────────────────
  const centroidStart = Date.now();
  const centroids = await scanCentroidsForProbe(
    tenantId,
    EMBEDDING_MODEL_KEY,
    probeVecLiteral,
    CENTROID_SCAN_LIMIT,
  );
  const centroidDurationMs = Date.now() - centroidStart;
  const centroidsScanned = centroids.length;

  if (centroidsScanned === 0) {
    return buildFinalResult([], 0, 0, 0, startedAt, algorithm, centroidDurationMs, 0, 0);
  }

  // Stage A gate: if the best centroid is too dissimilar the probe does not plausibly match
  // any enrolled employee — bail out before loading embedding data.
  const topCentroidSimilarity = centroids[0]?.centroidSimilarity ?? 0;
  if (topCentroidSimilarity < MIN_CENTROID_SIMILARITY) {
    return buildFinalResult(
      [],
      0,
      0,
      0,
      startedAt,
      algorithm,
      centroidDurationMs,
      centroidsScanned,
      0,
    );
  }

  // Shortlist: employees whose centroid similarity is within CENTROID_MARGIN of the best centroid.
  const shortlisted = centroids.filter(
    (c) => topCentroidSimilarity - c.centroidSimilarity <= CENTROID_MARGIN,
  );
  const shortlistedEmployeeIds = shortlisted.map((c) => c.employeeProfileId);
  const shortlistedEmployees = shortlistedEmployeeIds.length;

  // ── Stage B: load & score all embeddings for shortlisted employees ────────
  let captureCandidates: LibraryCandidateRow[] = [];
  if (shortlistedEmployeeIds.length > 0) {
    // Use pgvector <=> operator to order by cosine distance (HNSW index).
    // Filter at the SQL level: only load embeddings within MAX_COSINE_DISTANCE.
    // This avoids loading irrelevant vectors into Node.js memory.
    captureCandidates = await prisma.$queryRaw<LibraryCandidateRow[]>(
      Prisma.sql`
        SELECT
          fe.capture_id       AS "captureId",
          ep.id               AS "employeeId",
          ep.email            AS "employeeEmail",
          ep.name             AS "employeeName",
          ep.first_name       AS "employeeFirstName",
          fe.embedding_dim    AS "embeddingDim",
          fe.embedding_vec::float4[]  AS "embedding",
          (fe.embedding_vec <=> ${probeVecLiteral}::vector(512))  AS "cosineDistance"
        FROM face_embeddings fe
        JOIN employee_profiles ep ON ep.id = fe.employee_profile_id
        WHERE fe.tenant_id         = ${tenantId}::uuid
          AND fe.active             = true
          AND fe.model_key          = ${EMBEDDING_MODEL_KEY}
          AND ep.active             = true
          AND fe.embedding_vec      IS NOT NULL
          AND fe.employee_profile_id = ANY(
            SELECT unnest(${shortlistedEmployeeIds}::uuid[])
          )
          ${excludeCaptureId ? Prisma.sql`AND fe.capture_id <> ${excludeCaptureId}::uuid` : Prisma.sql``}
          AND (fe.embedding_vec <=> ${probeVecLiteral}::vector(512)) <= ${MAX_COSINE_DISTANCE}
        ORDER BY fe.embedding_vec <=> ${probeVecLiteral}::vector(512)
        LIMIT ${CANDIDATE_LIMIT}
      `,
    );
  }

  const embeddingLibrary = buildIdentityEmbeddingLibrary(captureCandidates);
  const { matches, candidatesRequested, candidateReadErrors, candidateComputeErrors } =
    scoreEmbeddingLibrary(probeEmbedding, embeddingLibrary);

  return buildFinalResult(
    matches,
    candidatesRequested,
    candidateReadErrors,
    candidateComputeErrors,
    startedAt,
    algorithm,
    centroidDurationMs,
    centroidsScanned,
    shortlistedEmployees,
  );
}

// ─── Legacy linear pipeline (fallback when centroid flag is off) ──────────────

async function buildLegacyEmbeddingRecognition(
  probeBuffer: Buffer,
  tenantId: string,
  excludeCaptureId: string | undefined,
): Promise<MatchPayload> {
  const startedAt = Date.now();
  const algorithm = `${EMBEDDING_MODEL_KEY}-vector-store`;
  const probeEmbedding = normalizeEmbeddingVector(await getFaceEmbedding(probeBuffer));
  const probeVecLiteral = `[${probeEmbedding.join(',')}]`;

  // Use pgvector <=> operator to order by cosine distance (HNSW index).
  // Filter at the SQL level: only load embeddings within MAX_COSINE_DISTANCE.
  // This avoids full table scans and leverages the HNSW index built in migration 0006.
  const captureCandidates = await prisma.$queryRaw<LibraryCandidateRow[]>(
    Prisma.sql`
      SELECT
        fe.capture_id       AS "captureId",
        ep.id               AS "employeeId",
        ep.email            AS "employeeEmail",
        ep.name             AS "employeeName",
        ep.first_name       AS "employeeFirstName",
        fe.embedding_dim    AS "embeddingDim",
        fe.embedding_vec::float4[]  AS "embedding",
        (fe.embedding_vec <=> ${probeVecLiteral}::vector(512))  AS "cosineDistance"
      FROM face_embeddings fe
      JOIN employee_profiles ep ON ep.id = fe.employee_profile_id
      WHERE fe.tenant_id  = ${tenantId}::uuid
        AND fe.active     = true
        AND fe.model_key  = ${EMBEDDING_MODEL_KEY}
        AND ep.active     = true
        AND fe.embedding_vec IS NOT NULL
        ${excludeCaptureId ? Prisma.sql`AND fe.capture_id <> ${excludeCaptureId}::uuid` : Prisma.sql``}
        AND (fe.embedding_vec <=> ${probeVecLiteral}::vector(512)) <= ${MAX_COSINE_DISTANCE}
      ORDER BY fe.embedding_vec <=> ${probeVecLiteral}::vector(512)
      LIMIT ${CANDIDATE_LIMIT}
    `,
  );

  const embeddingLibrary = buildIdentityEmbeddingLibrary(captureCandidates);
  const { matches, candidatesRequested, candidateReadErrors, candidateComputeErrors } =
    scoreEmbeddingLibrary(probeEmbedding, embeddingLibrary);

  return buildFinalResult(
    matches,
    candidatesRequested,
    candidateReadErrors,
    candidateComputeErrors,
    startedAt,
    algorithm,
    0,
    0,
    0,
  );
}

// ─── Route handler ────────────────────────────────────────────────────────────

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
      expectedEmployeeId: formData.get('expectedEmployeeId') ?? undefined,
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

    const expectedEmployeeIndexState = parsed.data.expectedEmployeeId
      ? await getEmployeeIndexState(session.tenantId, parsed.data.expectedEmployeeId)
      : null;

    if (parsed.data.expectedEmployeeId && !expectedEmployeeIndexState) {
      return NextResponse.json(apiError('NOT_FOUND', 'Employee not found'), { status: 404 });
    }

    const rawFile = parsed.data.image;
    const rawBuffer = Buffer.from(await rawFile.arrayBuffer());
    const sanitizedImage = await sanitizeImageUpload(rawBuffer, rawFile.type);

    const useCentroidPipeline = await featureFlags.isEnabled(
      'cap:face-recognition-centroid-pipeline',
      { tenantId: session.tenantId },
    );

    let matchPayload: MatchPayload;
    let fallbackApplied = false;
    let fallbackReason: string | null = null;

    try {
      if (useCentroidPipeline) {
        matchPayload = await buildCentroidFirstRecognition(
          sanitizedImage.buffer,
          session.tenantId,
          parsed.data.excludeCaptureId,
        );
      } else {
        matchPayload = await buildLegacyEmbeddingRecognition(
          sanitizedImage.buffer,
          session.tenantId,
          parsed.data.excludeCaptureId,
        );
      }
    } catch (error) {
      fallbackReason = error instanceof Error ? error.message : 'embedding_provider_error';

      // The embedding provider itself failed. Both pipelines call the same /embed
      // endpoint, so retrying the legacy one would just repeat the failure and double
      // the caller's wait — surface the real error instead of degrading to 'no_match'.
      if (error instanceof FaceEmbeddingError) {
        routeLog.warn(
          {
            err: error,
            code: error.code,
            providerStatus: error.providerStatus,
            usedCentroidPipeline: useCentroidPipeline,
          },
          'Face embedding provider failed — returning error to caller',
        );
        return faceEmbeddingErrorResponse(error);
      }

      // Not a provider failure (e.g. the centroid scan or vector query broke).
      // The legacy pipeline reads different tables, so it is worth one attempt.
      if (useCentroidPipeline) {
        try {
          fallbackApplied = true;
          matchPayload = await buildLegacyEmbeddingRecognition(
            sanitizedImage.buffer,
            session.tenantId,
            parsed.data.excludeCaptureId,
          );
        } catch (fallbackError) {
          if (fallbackError instanceof FaceEmbeddingError) {
            routeLog.warn(
              { err: fallbackError, code: fallbackError.code, originalReason: fallbackReason },
              'Face embedding provider failed during legacy fallback',
            );
            return faceEmbeddingErrorResponse(fallbackError);
          }
          routeLog.error(
            { err: fallbackError, originalReason: fallbackReason },
            'Recognition failed in both centroid and legacy pipelines',
          );
          return NextResponse.json(
            apiError('RECOGNITION_FAILED', 'Face recognition failed. Please try again.'),
            { status: 500 },
          );
        }
      } else {
        routeLog.error({ err: error }, 'Recognition failed in the legacy pipeline');
        return NextResponse.json(
          apiError('RECOGNITION_FAILED', 'Face recognition failed. Please try again.'),
          { status: 500 },
        );
      }
    }

    const { recognition, algorithm, telemetry } = matchPayload;
    const minConfidence = MIN_CONFIDENCE_EMBEDDING;

    const isConfidentMatch =
      recognition.matched && !!recognition.best && recognition.best.confidence >= minConfidence;

    const status = deriveRecognitionStatus({
      isConfidentMatch,
      candidatesEvaluated: recognition.candidatesEvaluated,
      useCentroidPipeline,
      fallbackApplied,
      centroidsScanned: telemetry.centroidsScanned,
      expectedEmployeeIndexState,
    });

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
        usedCentroidPipeline: useCentroidPipeline,
        fallbackApplied,
        fallbackReason,
        recognitionTelemetry: telemetry,
        minCandidates: MIN_CANDIDATES,
        minConfidence,
        minConfidenceEmbedding: MIN_CONFIDENCE_EMBEDDING,
        embeddingAmbiguityMargin: EMBEDDING_AMBIGUITY_MARGIN,
        centroidMargin: CENTROID_MARGIN,
      },
      request,
    });

    // Persist recognition result back to the capture record so the recent-captures
    // page can display identity and confidence without re-running recognition.
    if (parsed.data.excludeCaptureId) {
      await prisma.$executeRaw`
        UPDATE camera_captures
        SET
          recognition_status      = ${status},
          recognized_employee_id  = ${isConfidentMatch ? (recognition.best?.candidate.userId ?? null) : null}::uuid,
          recognition_confidence  = ${recognition.best?.confidence ?? null}::float4,
          recognized_at           = now()
        WHERE id = ${parsed.data.excludeCaptureId}::uuid
      `.catch(() => {
        // Non-fatal: capture may have been pruned between upload and recognition.
      });
    }

    routeLog.info(
      {
        algorithm,
        providerConfigured: RECOGNITION_PROVIDER,
        usedCentroidPipeline: useCentroidPipeline,
        fallbackApplied,
        status,
        confidence: recognition.best?.confidence ?? null,
        candidatesEvaluated: recognition.candidatesEvaluated,
        centroidsScanned: telemetry.centroidsScanned,
        centroidDurationMs: telemetry.centroidDurationMs,
        shortlistedEmployees: telemetry.shortlistedEmployees,
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
          minConfidence,
          embeddingAmbiguityMargin: EMBEDDING_AMBIGUITY_MARGIN,
          centroidMargin: CENTROID_MARGIN,
        },
      }),
      { status: 200 },
    );
  },
  {
    featureFlag: 'CAMERA_CAPTURE_ENABLED',
  },
);

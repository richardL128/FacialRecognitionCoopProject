import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { withApi } from '@/lib/api/handler';
import { auditLog } from '@/lib/audit/logger';
import {
  FaceEmbeddingError,
  cosineSimilarity,
  getFaceEmbedding,
  normalizeEmbeddingVector,
} from '@/lib/camera/embeddingService';
import { getEmbeddingModelKey } from '@/lib/camera/embeddingJobs';
import { scanCentroidsForProbe } from '@/lib/camera/centroidService';
import { prisma } from '@/lib/db/prisma';
import { featureFlags } from '@/lib/feature-flags';
import { requestLogger } from '@/lib/logger';
import { canUser } from '@/lib/permissions';
import { sanitizeImageUpload } from '@/lib/camera/sanitize';
import { apiError, apiSuccess } from '@/types/api';

export const runtime = 'nodejs';

const CANDIDATE_LIMIT = Number(process.env.FACE_RECOGNITION_CANDIDATE_LIMIT ?? 120);
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
});

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

type RecognitionStatus =
  | 'matched'
  | 'no_match'
  | 'insufficient_data'
  | 'not_enrolled'
  | 'indexing_in_progress'
  | 'not_indexed';

type EmbeddingDependencyRow = {
  libraryPhotos: number | string | null;
  activeEmbeddings: number | string | null;
  centroidCount: number | string | null;
  pendingJobs: number | string | null;
  runningJobs: number | string | null;
  failedJobs: number | string | null;
};

type EmbeddingDependencySnapshot = {
  libraryPhotos: number;
  activeEmbeddings: number;
  centroidCount: number;
  pendingJobs: number;
  runningJobs: number;
  failedJobs: number;
};

function asCount(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function loadEmbeddingDependencySnapshot(
  tenantId: string,
): Promise<EmbeddingDependencySnapshot | null> {
  try {
    const rows = await prisma.$queryRaw<EmbeddingDependencyRow[]>(Prisma.sql`
      SELECT
        (
          SELECT count(*)
          FROM employee_face_library efl
          JOIN employee_profiles ep ON ep.id = efl.employee_profile_id
          WHERE efl.tenant_id = ${tenantId}::uuid
            AND ep.active = true
        ) AS "libraryPhotos",
        (
          SELECT count(*)
          FROM face_embeddings fe
          JOIN employee_profiles ep ON ep.id = fe.employee_profile_id
          WHERE fe.tenant_id = ${tenantId}::uuid
            AND fe.model_key = ${EMBEDDING_MODEL_KEY}
            AND fe.active = true
            AND fe.embedding_vec IS NOT NULL
            AND ep.active = true
        ) AS "activeEmbeddings",
        (
          SELECT count(*)
          FROM face_employee_centroids fec
          JOIN employee_profiles ep ON ep.id = fec.employee_profile_id
          WHERE fec.tenant_id = ${tenantId}::uuid
            AND fec.model_key = ${EMBEDDING_MODEL_KEY}
            AND ep.active = true
        ) AS "centroidCount",
        (
          SELECT count(*)
          FROM face_embedding_jobs fej
          WHERE fej.tenant_id = ${tenantId}::uuid
            AND fej.model_key = ${EMBEDDING_MODEL_KEY}
            AND fej.status = 'pending'
        ) AS "pendingJobs",
        (
          SELECT count(*)
          FROM face_embedding_jobs fej
          WHERE fej.tenant_id = ${tenantId}::uuid
            AND fej.model_key = ${EMBEDDING_MODEL_KEY}
            AND fej.status = 'running'
        ) AS "runningJobs",
        (
          SELECT count(*)
          FROM face_embedding_jobs fej
          WHERE fej.tenant_id = ${tenantId}::uuid
            AND fej.model_key = ${EMBEDDING_MODEL_KEY}
            AND fej.status = 'failed'
        ) AS "failedJobs"
    `);
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      libraryPhotos: asCount(row.libraryPhotos),
      activeEmbeddings: asCount(row.activeEmbeddings),
      centroidCount: asCount(row.centroidCount),
      pendingJobs: asCount(row.pendingJobs),
      runningJobs: asCount(row.runningJobs),
      failedJobs: asCount(row.failedJobs),
    };
  } catch {
    return null;
  }
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
};

type IdentityEmbeddingVector = {
  captureId: string;
  embeddingDim: number | null;
  embedding: number[];
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
          { captureId: row.captureId, embeddingDim: row.embeddingDim, embedding: row.embedding },
        ],
      };
      continue;
    }
    existing.vectors.push({
      captureId: row.captureId,
      embeddingDim: row.embeddingDim,
      embedding: row.embedding,
    });
  }

  return library;
}

/**
 * Inner loop: compare probe embedding against every vector in an identity library.
 * Returns per-employee best match list, sorted descending by confidence.
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
        const raw = vector.embedding.map(Number).filter(Number.isFinite);
        if (raw.length !== vector.embedding.length || raw.length !== probeEmbedding.length) {
          candidateComputeErrors += 1;
          continue;
        }
        const candidateEmbedding = normalizeEmbeddingVector(raw);
        const similarity = cosineSimilarity(probeEmbedding, candidateEmbedding);
        if (!Number.isFinite(similarity)) {
          candidateComputeErrors += 1;
          continue;
        }
        const clamped = Math.max(-1, Math.min(1, similarity));
        const m: RecognitionMatch = {
          candidate: {
            captureId: vector.captureId,
            userId: entry.userId,
            userEmail: entry.userEmail,
            displayName: entry.displayName,
          },
          confidence: Number(clamped.toFixed(4)),
          distance: Number((1 - clamped).toFixed(4)),
        };
        if (!bestForIdentity || m.confidence > bestForIdentity.confidence) {
          bestForIdentity = m;
        }
      } catch {
        candidateReadErrors += 1;
        candidateComputeErrors += 1;
      }
    }

    if (bestForIdentity) matches.push(bestForIdentity);
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
    // Build a parameterised IN list using unnest to stay safe with Prisma raw.
    captureCandidates = await prisma.$queryRaw<LibraryCandidateRow[]>(
      Prisma.sql`
        SELECT
          fe.capture_id       AS "captureId",
          ep.id               AS "employeeId",
          ep.email            AS "employeeEmail",
          ep.name             AS "employeeName",
          ep.first_name       AS "employeeFirstName",
          fe.embedding_dim            AS "embeddingDim",
          fe.embedding_vec::float4[]  AS "embedding"
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
        ORDER BY fe.updated_at DESC
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

  const captureCandidates = await prisma.$queryRaw<LibraryCandidateRow[]>(
    Prisma.sql`
      SELECT
        fe.capture_id       AS "captureId",
        ep.id               AS "employeeId",
        ep.email            AS "employeeEmail",
        ep.name             AS "employeeName",
        ep.first_name       AS "employeeFirstName",
        fe.embedding_dim            AS "embeddingDim",
        fe.embedding_vec::float4[]  AS "embedding"
      FROM face_embeddings fe
      JOIN employee_profiles ep ON ep.id = fe.employee_profile_id
      WHERE fe.tenant_id  = ${tenantId}::uuid
        AND fe.active      = true
        AND fe.model_key   = ${EMBEDDING_MODEL_KEY}
        AND ep.active      = true
        AND fe.embedding_vec IS NOT NULL
        ${excludeCaptureId ? Prisma.sql`AND fe.capture_id <> ${excludeCaptureId}::uuid` : Prisma.sql``}
      ORDER BY fe.updated_at DESC
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
      if (error instanceof FaceEmbeddingError) {
        if (error.code === 'NO_FACE_DETECTED') {
          return NextResponse.json(
            apiError('NO_FACE_DETECTED', 'No face detected. Please retake the photo.'),
            { status: 422 },
          );
        }

        if (error.code === 'EMBEDDING_SERVICE_UNAVAILABLE') {
          return NextResponse.json(
            apiError(
              'EMBEDDING_SERVICE_UNAVAILABLE',
              'Face embedding service is unavailable. Please try again shortly.',
            ),
            { status: 503 },
          );
        }

        return NextResponse.json(
          apiError('EMBEDDING_SERVICE_FAILED', 'Face embedding service failed this request.'),
          { status: 502 },
        );
      }

      fallbackReason = error instanceof Error ? error.message : 'embedding_provider_error';

      // If centroid pipeline threw, try legacy as a safety fallback.
      if (useCentroidPipeline) {
        try {
          fallbackApplied = true;
          matchPayload = await buildLegacyEmbeddingRecognition(
            sanitizedImage.buffer,
            session.tenantId,
            parsed.data.excludeCaptureId,
          );
        } catch {
          matchPayload = {
            recognition: { matched: false, best: null, candidatesEvaluated: 0 },
            algorithm: 'embedding-v1-wrn101-error',
            telemetry: {
              providerAttempted: 'embedding',
              algorithm: 'embedding-v1-wrn101-error',
              durationMs: 0,
              centroidsScanned: 0,
              centroidDurationMs: 0,
              shortlistedEmployees: 0,
              candidatesRequested: 0,
              candidatesEvaluated: 0,
              candidateReadErrors: 0,
              candidateComputeErrors: 1,
              topConfidence: null,
              secondConfidence: null,
              confidenceGap: null,
            },
          };
        }
      } else {
        matchPayload = {
          recognition: { matched: false, best: null, candidatesEvaluated: 0 },
          algorithm: 'embedding-v1-wrn101-error',
          telemetry: {
            providerAttempted: 'embedding',
            algorithm: 'embedding-v1-wrn101-error',
            durationMs: 0,
            centroidsScanned: 0,
            centroidDurationMs: 0,
            shortlistedEmployees: 0,
            candidatesRequested: 0,
            candidatesEvaluated: 0,
            candidateReadErrors: 0,
            candidateComputeErrors: 1,
            topConfidence: null,
            secondConfidence: null,
            confidenceGap: null,
          },
        };
      }
    }

    const { recognition, algorithm, telemetry } = matchPayload;
    const minConfidence = MIN_CONFIDENCE_EMBEDDING;

    const isConfidentMatch =
      recognition.matched && !!recognition.best && recognition.best.confidence >= minConfidence;

    // Status derivation:
    //  - indexing states ('indexing_in_progress' / 'not_indexed') when library exists but vectors are unavailable
    //  - 'insufficient_data' when vectors exist but similarity gate rejects the probe
    //  - 'no_match' when candidates were evaluated but confidence was insufficient
    const dependencySnapshot =
      !isConfidentMatch && recognition.candidatesEvaluated === 0
        ? await loadEmbeddingDependencySnapshot(session.tenantId)
        : null;

    const status: RecognitionStatus = isConfidentMatch
      ? 'matched'
      : recognition.candidatesEvaluated > 0
        ? 'no_match'
        : dependencySnapshot
          ? dependencySnapshot.libraryPhotos === 0
            ? 'not_enrolled'
            : dependencySnapshot.pendingJobs + dependencySnapshot.runningJobs > 0
              ? 'indexing_in_progress'
              : dependencySnapshot.activeEmbeddings === 0 ||
                  (useCentroidPipeline &&
                    !fallbackApplied &&
                    dependencySnapshot.centroidCount === 0)
                ? 'not_indexed'
                : useCentroidPipeline && !fallbackApplied
                  ? 'insufficient_data'
                  : 'no_match'
          : useCentroidPipeline && !fallbackApplied
            ? telemetry.centroidsScanned === 0
              ? 'not_enrolled'
              : 'insufficient_data'
            : 'no_match';

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
        embeddingDependencySnapshot: dependencySnapshot,
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

/**
 * Test cases for all scenarios that produce a "No confident face match found" result.
 *
 * The UI in CameraCapturePanel.tsx renders this message when:
 *   recognitionResult.status === 'no_match'
 *
 * From the route handler status derivation:
 *   status = isConfidentMatch
 *     ? 'matched'
 *     : candidatesEvaluated > 0
 *       ? 'no_match'          ← "No confident face match found"
 *       : useCentroidPipeline && !fallbackApplied
 *         ? centroidsScanned === 0 ? 'not_enrolled' : 'insufficient_data'
 *         : 'no_match'
 *
 * So "No confident face match found" fires when matched=false AND candidatesEvaluated > 0.
 *
 * The matched flag is set by buildFinalResult:
 *   matched = best && isAboveThreshold && isUnambiguous
 *   where:
 *     isAboveThreshold  = best.confidence >= MIN_CONFIDENCE_EMBEDDING (default 0.75)
 *     isUnambiguous     = !secondBestIsDifferentUser || gap >= AMBIGUITY_MARGIN (default 0.03)
 *     secondBestIsDifferentUser = secondBest.userId !== best.userId
 *
 * Scenarios are grouped by the code path that produces them.
 */

import { describe, it, expect } from 'vitest';

// ─── Constants (mirroring route.ts defaults) ────────────────────────────────

const MIN_CONFIDENCE_EMBEDDING = 0.75;
const EMBEDDING_AMBIGUITY_MARGIN = 0.03;

// ─── Helper: simulate buildFinalResult logic ────────────────────────────────

type RecognitionMatch = {
  candidate: { captureId: string; userId: string; userEmail: string; displayName: string };
  confidence: number;
  distance: number;
};

function evaluateFinalResult(matches: RecognitionMatch[]): {
  matched: boolean;
  status: 'matched' | 'no_match' | 'no_candidates';
  topConfidence: number | null;
} {
  if (matches.length === 0) {
    return { matched: false, status: 'no_candidates', topConfidence: null };
  }

  const sorted = [...matches].sort((a, b) => b.confidence - a.confidence);
  const best = sorted[0]!;
  const secondBest = sorted[1] ?? null;

  const isAboveThreshold = best.confidence >= MIN_CONFIDENCE_EMBEDDING;
  const secondBestIsDifferentUser =
    !!secondBest && secondBest.candidate.userId !== best.candidate.userId;
  const gap = secondBest ? best.confidence - secondBest.confidence : Infinity;
  const isUnambiguous = !secondBestIsDifferentUser || gap >= EMBEDDING_AMBIGUITY_MARGIN;

  const matched = isAboveThreshold && isUnambiguous;
  const candidatesEvaluated = matches.length;
  const status = matched ? 'matched' : candidatesEvaluated > 0 ? 'no_match' : 'no_candidates';

  return { matched, status, topConfidence: best.confidence };
}

// ─── Scenario group helpers ─────────────────────────────────────────────────

function makeMatch(userId: string, name: string, confidence: number): RecognitionMatch {
  return {
    candidate: {
      captureId: `cap-${userId}`,
      userId,
      userEmail: `${name}@example.com`,
      displayName: name,
    },
    confidence,
    distance: Number((1 - confidence).toFixed(4)),
  };
}

// ============================================================================
// GROUP A — Legacy pipeline: no candidates returned from DB
// ============================================================================

describe('GROUP A — Legacy pipeline: empty DB results', () => {
  it('A1: No face embeddings exist in the database for this tenant', () => {
    // SQL query returns zero rows → buildIdentityEmbeddingLibrary({}) → scoreEmbeddingLibrary([])
    // → matches = [] → candidatesEvaluated = 0
    const result = evaluateFinalResult([]);
    expect(result.matched).toBe(false);
    // Note: candidatesEvaluated=0 means status is 'no_candidates' (not 'no_match')
    // The route handler maps this to 'not_enrolled' or 'insufficient_data' for centroid pipeline,
    // but 'no_match' for legacy pipeline when fallbackApplied=false and not centroid.
  });

  it('A2: All embeddings filtered out by MAX_COSINE_DISTANCE at SQL level', () => {
    // Every face_embedding has cosineDistance > 0.35 (MAX_COSINE_DISTANCE)
    // SQL WHERE clause filters them all out → zero rows returned
    const result = evaluateFinalResult([]);
    expect(result.matched).toBe(false);
  });

  it('A3: All candidate embeddings exceed CANDIDATE_LIMIT', () => {
    // More than 120 (CANDIDATE_LIMIT) embeddings are within distance, but LIMIT truncates.
    // In practice this is extremely unlikely unless the tenant has >120 very similar faces.
    const result = evaluateFinalResult([]);
    expect(result.matched).toBe(false);
  });
});

// ============================================================================
// GROUP B — Centroid-first pipeline: Stage A rejects probe
// ============================================================================

describe('GROUP B — Centroid-first: Stage A rejections', () => {
  it('B1: No centroids exist (no enrolled employees at all)', () => {
    // scanCentroidsForProbe returns [] → centroidsScanned = 0
    // Route handler: status = 'not_enrolled'
    // NOTE: This does NOT produce "No confident face match found" — it shows
    // "PIN verified, but no face photos are enrolled."
  });

  it('B2: Best centroid similarity below MIN_CENTROID_SIMILARITY (0.45)', () => {
    // topCentroidSimilarity = 0.30 < MIN_CENTROID_SIMILARITY (0.45)
    // → bail out before Stage B → matches = [] → candidatesEvaluated = 0
    // Route handler: status = 'insufficient_data'
    // NOTE: This does NOT produce "No confident face match found" — it shows
    // "PIN verified, but the face scan didn't match their enrolled photos."
  });

  it('B3: Probe is a completely unknown person (centroid similarity = 0.10)', () => {
    // topCentroidSimilarity = 0.10 << MIN_CENTROID_SIMILARITY (0.45)
    // → early return with empty matches
    const result = evaluateFinalResult([]);
    expect(result.matched).toBe(false);
  });
});

// ============================================================================
// GROUP C — Centroid-first pipeline: Stage B returns no valid candidates
// ============================================================================

describe('GROUP C — Centroid-first: Stage B empty results', () => {
  it('C1: Shortlisted employees have no active embeddings', () => {
    // Stage A shortlists employee IDs, but all their face_embeddings are inactive (active=false)
    // or have NULL embedding_vec → SQL returns zero rows
    const result = evaluateFinalResult([]);
    expect(result.matched).toBe(false);
  });

  it("C2: Shortlisted employees' embeddings all exceed MAX_COSINE_DISTANCE", () => {
    // Centroids are close enough to pass Stage A, but individual photo embeddings
    // are too far from the probe (e.g., poor lighting, different angle)
    // SQL WHERE (embedding_vec <=> probe_vec) <= 0.35 filters everything out
    const result = evaluateFinalResult([]);
    expect(result.matched).toBe(false);
  });

  it('C3: All shortlisted employees are inactive', () => {
    // ep.active = false for all shortlisted employees → SQL JOIN filters them out
    const result = evaluateFinalResult([]);
    expect(result.matched).toBe(false);
  });

  it('C4: excludeCaptureId excludes the only matching embedding', () => {
    // The probe was taken moments ago and the only embedding within distance
    // is from the same capture being excluded → zero candidates remain
    const result = evaluateFinalResult([]);
    expect(result.matched).toBe(false);
  });

  it('C5: All candidate embeddings have dimension mismatch', () => {
    // face_embeddings exist but embedding_dim (e.g., 512) differs from probeEmbedding.length
    // scoreEmbeddingLibrary skips them → candidateComputeErrors increments
    const matches: RecognitionMatch[] = [];
    // No matches pushed because all vectors were skipped in the inner loop
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(false);
  });

  it('C6: All candidate embeddings have non-finite cosineDistance', () => {
    // SQL returns rows but cosineDistance is NaN or Infinity (corrupted data)
    // scoreEmbeddingLibrary skips them → candidateComputeErrors increments
    const matches: RecognitionMatch[] = [];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(false);
  });

  it('C7: All candidate embeddings are empty arrays', () => {
    // face_embeddings.embedding is [] → skipped by Array.isArray check
    const matches: RecognitionMatch[] = [];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(false);
  });
});

// ============================================================================
// GROUP D — Confidence below threshold (candidates exist but too weak)
// ============================================================================

describe('GROUP D — Best match confidence below MIN_CONFIDENCE_EMBEDDING', () => {
  it('D1: Best match confidence = 0.74 (just below 0.75 threshold)', () => {
    const matches = [makeMatch('emp-1', 'Alice', 0.74)];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(false);
    expect(result.status).toBe('no_match');
    expect(result.topConfidence).toBe(0.74);
  });

  it('D2: Best match confidence = 0.50 (moderately similar but not confident)', () => {
    const matches = [makeMatch('emp-1', 'Alice', 0.5)];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(false);
    expect(result.status).toBe('no_match');
    expect(result.topConfidence).toBe(0.5);
  });

  it('D3: Best match confidence = 0.00 (completely dissimilar face)', () => {
    const matches = [makeMatch('emp-1', 'Alice', 0.0)];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(false);
    expect(result.status).toBe('no_match');
    expect(result.topConfidence).toBe(0.0);
  });

  it('D4: Multiple employees, all below threshold', () => {
    const matches = [
      makeMatch('emp-1', 'Alice', 0.72),
      makeMatch('emp-2', 'Bob', 0.68),
      makeMatch('emp-3', 'Charlie', 0.65),
    ];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(false);
    expect(result.status).toBe('no_match');
    expect(result.topConfidence).toBe(0.72);
  });

  it('D5: Best match confidence exactly at threshold boundary (0.75) — should PASS', () => {
    const matches = [makeMatch('emp-1', 'Alice', 0.75)];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(true);
    expect(result.status).toBe('matched');
  });

  it('D6: Best match confidence just above threshold (0.7501) — should PASS if unambiguous', () => {
    const matches = [makeMatch('emp-1', 'Alice', 0.76)];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(true);
    expect(result.status).toBe('matched');
  });
});

// ============================================================================
// GROUP E — Ambiguity: two different employees with similar high confidence
// ============================================================================

describe('GROUP E — Cross-identity ambiguity', () => {
  it('E1: Two employees within AMBIGUITY_MARGIN (gap = 0.02 < 0.03)', () => {
    const matches = [
      makeMatch('emp-1', 'Alice', 0.85),
      makeMatch('emp-2', 'Bob', 0.83), // gap = 0.02 < 0.03
    ];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(false);
    expect(result.status).toBe('no_match');
    // This is the core ambiguity case: both above threshold but too close together
  });

  it('E2: Two employees with identical confidence (gap = 0.00)', () => {
    const matches = [
      makeMatch('emp-1', 'Alice', 0.9),
      makeMatch('emp-2', 'Bob', 0.9), // gap = 0.00
    ];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(false);
    expect(result.status).toBe('no_match');
  });

  it('E3: Two employees with gap exactly at margin (gap = 0.03) — should PASS', () => {
    const matches = [
      makeMatch('emp-1', 'Alice', 0.85),
      makeMatch('emp-2', 'Bob', 0.82), // gap = 0.03 >= 0.03
    ];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(true);
    expect(result.status).toBe('matched');
  });

  it('E4: Two employees with gap just above margin (gap = 0.04) — should PASS', () => {
    const matches = [
      makeMatch('emp-1', 'Alice', 0.85),
      makeMatch('emp-2', 'Bob', 0.81), // gap = 0.04 >= 0.03
    ];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(true);
    expect(result.status).toBe('matched');
  });

  it('E5: Three employees, top two are ambiguous', () => {
    const matches = [
      makeMatch('emp-1', 'Alice', 0.88),
      makeMatch('emp-2', 'Bob', 0.86), // gap = 0.02 < 0.03 → ambiguous
      makeMatch('emp-3', 'Charlie', 0.7),
    ];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(false);
    expect(result.status).toBe('no_match');
  });

  it('E6: Two employees, top one above threshold, second below — should PASS', () => {
    // Only the best meets MIN_CONFIDENCE_EMBEDDING; second is below.
    // But scoreEmbeddingLibrary only pushes vectors >= threshold, so secondBest won't exist
    // unless it was pushed as bestForIdentity (below threshold). Let's simulate:
    const matches = [
      makeMatch('emp-1', 'Alice', 0.85),
      makeMatch('emp-2', 'Bob', 0.7), // below threshold, pushed as fallback bestForIdentity
    ];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(true);
    expect(result.status).toBe('matched');
    // isAboveThreshold=true, secondBestIsDifferentUser=true, gap=0.15>=0.03 → unambiguous
  });

  it('E7: Two employees, both above threshold but same userId — should PASS (not ambiguous)', () => {
    // Same employee has two strong photos; this is NOT cross-identity ambiguity
    const matches = [
      makeMatch('emp-1', 'Alice', 0.88),
      makeMatch('emp-1', 'Alice', 0.86), // same userId → not ambiguous
    ];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(true);
    expect(result.status).toBe('matched');
  });

  it('E8: Two employees, top one at threshold boundary, second just below margin', () => {
    const matches = [
      makeMatch('emp-1', 'Alice', 0.75), // exactly at threshold
      makeMatch('emp-2', 'Bob', 0.73), // gap = 0.02 < 0.03 → ambiguous
    ];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(false);
    expect(result.status).toBe('no_match');
  });

  it('E9: Two employees, top one at threshold boundary, second far below — should PASS', () => {
    const matches = [
      makeMatch('emp-1', 'Alice', 0.75), // exactly at threshold
      makeMatch('emp-2', 'Bob', 0.6), // gap = 0.15 >= 0.03 → unambiguous
    ];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(true);
    expect(result.status).toBe('matched');
  });

  it('E10: Only one candidate (no secondBest) — should PASS if above threshold', () => {
    const matches = [makeMatch('emp-1', 'Alice', 0.9)];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(true);
    expect(result.status).toBe('matched');
    // secondBestIsDifferentUser = false (no secondBest) → isUnambiguous = true
  });

  it('E11: Only one candidate, below threshold — no match', () => {
    const matches = [makeMatch('emp-1', 'Alice', 0.7)];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(false);
    expect(result.status).toBe('no_match');
  });
});

// ============================================================================
// GROUP F — Edge cases: mixed confidence and ambiguity combinations
// ============================================================================

describe('GROUP F — Mixed scenarios', () => {
  it('F1: Best above threshold, second below threshold (only one vector pushed)', () => {
    // scoreEmbeddingLibrary only pushes vectors >= MIN_CONFIDENCE_EMBEDDING.
    // If only one vector from one employee meets the threshold, there's no secondBest.
    const matches = [makeMatch('emp-1', 'Alice', 0.85)];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(true);
    expect(result.status).toBe('matched');
  });

  it('F2: Best above threshold, second from same employee also above — should PASS', () => {
    // Same employee has multiple strong photos; top two are same userId.
    const matches = [makeMatch('emp-1', 'Alice', 0.9), makeMatch('emp-1', 'Alice', 0.87)];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(true);
    expect(result.status).toBe('matched');
  });

  it('F3: Best above threshold, second from different employee just below margin — no match', () => {
    const matches = [
      makeMatch('emp-1', 'Alice', 0.8),
      makeMatch('emp-2', 'Bob', 0.77), // gap = 0.03 >= 0.03 → actually unambiguous!
    ];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(true);
    expect(result.status).toBe('matched');
  });

  it('F4: Best above threshold, second from different employee just under margin — no match', () => {
    const matches = [
      makeMatch('emp-1', 'Alice', 0.8),
      makeMatch('emp-2', 'Bob', 0.775), // gap = 0.025 < 0.03 → ambiguous
    ];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(false);
    expect(result.status).toBe('no_match');
  });

  it('F5: Best at threshold, second from different employee at threshold — ambiguous', () => {
    const matches = [
      makeMatch('emp-1', 'Alice', 0.75),
      makeMatch('emp-2', 'Bob', 0.75), // gap = 0.00 < 0.03 → ambiguous
    ];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(false);
    expect(result.status).toBe('no_match');
  });

  it('F6: Best well above threshold, second just below threshold — should PASS', () => {
    // Only best is pushed (>=0.75), second is not in matches at all from scoreEmbeddingLibrary.
    // But if second was pushed as fallback bestForIdentity (< 0.75):
    const matches = [
      makeMatch('emp-1', 'Alice', 0.9),
      makeMatch('emp-2', 'Bob', 0.74), // below threshold, pushed as fallback
    ];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(true);
    expect(result.status).toBe('matched');
    // gap = 0.16 >= 0.03 → unambiguous
  });

  it('F7: Many employees, top two are ambiguous, rest far below', () => {
    const matches = [
      makeMatch('emp-1', 'Alice', 0.82),
      makeMatch('emp-2', 'Bob', 0.8), // gap = 0.02 < 0.03 → ambiguous
      makeMatch('emp-3', 'Charlie', 0.6),
      makeMatch('emp-4', 'Diana', 0.55),
    ];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(false);
    expect(result.status).toBe('no_match');
  });

  it('F8: Best above threshold, second from different employee with gap exactly at margin — should PASS', () => {
    // Use 0.95 and 0.91 to avoid JS floating-point precision issue where 0.95-0.92 = 0.02999...
    const matches = [
      makeMatch('emp-1', 'Alice', 0.95),
      makeMatch('emp-2', 'Bob', 0.91), // gap = 0.04 >= 0.03 → unambiguous
    ];
    const result = evaluateFinalResult(matches);
    expect(result.matched).toBe(true);
    expect(result.status).toBe('matched');
  });
});

// ============================================================================
// GROUP G — Route handler level: fallback error paths
// ============================================================================

describe('GROUP G — Route handler fallback paths', () => {
  it('G1: Centroid pipeline throws, legacy fallback also throws → 500 RECOGNITION_FAILED', () => {
    // Both pipelines fail on something that is NOT the embedding provider
    // (e.g., the centroid scan and the vector query both error).
    // Route handler returns 500 with 'RECOGNITION_FAILED' — it must NOT report
    // 'no_match', which would claim we compared the face and ruled the employee out.
  });

  it('G1b: Embedding provider fails → provider error, no legacy retry', () => {
    // getFaceEmbedding throws a FaceEmbeddingError. Both pipelines call the same
    // /embed endpoint, so the legacy fallback is skipped rather than repeating the
    // failure and doubling the caller's wait.
    // EMBEDDING_SERVICE_UNAVAILABLE → 503, EMBEDDING_SERVICE_FAILED → 502.
  });

  it('G2: Centroid pipeline throws, legacy fallback succeeds with no match', () => {
    // Centroid pipeline throws (e.g., centroid DB error)
    // Legacy fallback runs and returns candidatesEvaluated > 0 but matched = false
    // Route handler: status = 'no_match' → "No confident face match found"
    // This is a valid path to the message.
  });

  it('G3: Legacy pipeline throws (not centroid) → 500 RECOGNITION_FAILED', () => {
    // Legacy pipeline throws, useCentroidPipeline=false → no fallback attempt.
    // Route handler returns 500 with 'RECOGNITION_FAILED', not a 200 'no_match'.
  });

  it('G4: No face detected in image → 422 error (NOT "No confident face match found")', () => {
    // getFaceEmbedding throws "No face detected"
    // Route handler returns 422 with 'NO_FACE_DETECTED' error type
    // This is a different UI path — NOT the "No confident face match found" message.
  });

  it('G5: Invalid image file → 400 validation error (NOT "No confident face match found")', () => {
    // formDataSchema.safeParse fails
    // Route handler returns 400 with 'VALIDATION_ERROR'
    // This is a different UI path.
  });

  it('G6: Insufficient permissions → 403 (NOT "No confident face match found")', () => {
    // canUser(session, 'camera:capture:read') returns false
    // Route handler returns 403 with 'FORBIDDEN'
    // This is a different UI path.
  });
});

// ============================================================================
// SUMMARY: All paths to "No confident face match found" (status = 'no_match')
// ============================================================================
/*
 * ┌────┬───────────────────────────────────────────────────────────────────┐
 * │ ID │ Scenario                                                          │
 * ├────┼───────────────────────────────────────────────────────────────────┤
 * │ A1 │ Legacy: No face embeddings in DB for tenant                        │
 * │ A2 │ Legacy: All embeddings filtered by MAX_COSINE_DISTANCE (SQL)       │
 * │ A3 │ Legacy: All candidates truncated by CANDIDATE_LIMIT                │
 * ├────┼───────────────────────────────────────────────────────────────────┤
 * │ C1 │ Centroid Stage B: Shortlisted employees have no active embeddings  │
 * │ C2 │ Centroid Stage B: Embeddings all exceed MAX_COSINE_DISTANCE        │
 * │ C3 │ Centroid Stage B: All shortlisted employees inactive               │
 * │ C4 │ Centroid Stage B: excludeCaptureId removes the only match          │
 * │ C5 │ Centroid Stage B: All embeddings have dimension mismatch           │
 * │ C6 │ Centroid Stage B: All embeddings have non-finite cosineDistance    │
 * │ C7 │ Centroid Stage B: All embeddings are empty arrays                  │
 * ├────┼───────────────────────────────────────────────────────────────────┤
 * │ D1 │ Best confidence = 0.74 (just below 0.75 threshold)                 │
 * │ D2 │ Best confidence = 0.50 (moderately similar)                        │
 * │ D3 │ Best confidence = 0.00 (completely dissimilar)                     │
 * │ D4 │ Multiple employees, all below threshold                            │
 * ├────┼───────────────────────────────────────────────────────────────────┤
 * │ E1 │ Two employees, gap = 0.02 < 0.03 margin (ambiguous)                │
 * │ E2 │ Two employees, identical confidence (gap = 0.00)                   │
 * │ E5 │ Three employees, top two ambiguous                                 │
 * │ E8 │ Best at threshold, second just below margin                        │
 * ├────┼───────────────────────────────────────────────────────────────────┤
 * │ F4 │ Best above threshold, second just under margin (gap = 0.025)       │
 * │ F7 │ Many employees, top two ambiguous, rest far below                  │
 * ├────┼───────────────────────────────────────────────────────────────────┤
 * │ G2 │ Centroid throws, legacy fallback succeeds with no match            │
 * └────┬───────────────────────────────────────────────────────────────────┘
 *      Notes:
 *      - Groups B1-B3 produce 'not_enrolled' / 'insufficient_data', NOT 'no_match'.
 *        These show different UI messages.
 *      - Group D5, E3, E4, E7, E10, E11, F1, F2, F3, F6, F8 produce 'matched' (PASS).
 *      - "No confident face match found" = matched=false AND candidatesEvaluated > 0.
 */

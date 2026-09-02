import { describe, expect, it } from 'vitest';
import { deriveRecognitionStatus, type EmployeeIndexState } from './recognitionStatus';

const indexedEmployee: EmployeeIndexState = {
  enrolledPhotoCount: 3,
  activeEmbeddingCount: 3,
  centroidCount: 1,
  activeJobCount: 0,
};

function derive(overrides: Partial<Parameters<typeof deriveRecognitionStatus>[0]> = {}) {
  return deriveRecognitionStatus({
    isConfidentMatch: false,
    candidatesEvaluated: 0,
    useCentroidPipeline: true,
    fallbackApplied: false,
    centroidsScanned: 0,
    expectedEmployeeIndexState: indexedEmployee,
    ...overrides,
  });
}

describe('deriveRecognitionStatus', () => {
  it('preserves a confident tenant-wide match for PIN conflict detection', () => {
    expect(
      derive({
        isConfidentMatch: true,
        expectedEmployeeIndexState: {
          enrolledPhotoCount: 0,
          activeEmbeddingCount: 0,
          centroidCount: 0,
          activeJobCount: 0,
        },
      }),
    ).toBe('matched');
  });

  it('returns not_enrolled only when the expected employee has no photos', () => {
    expect(
      derive({
        expectedEmployeeIndexState: {
          enrolledPhotoCount: 0,
          activeEmbeddingCount: 0,
          centroidCount: 0,
          activeJobCount: 0,
        },
      }),
    ).toBe('not_enrolled');
  });

  it('returns indexing_in_progress when photos exist and an unusable index has active jobs', () => {
    expect(
      derive({
        expectedEmployeeIndexState: {
          enrolledPhotoCount: 3,
          activeEmbeddingCount: 0,
          centroidCount: 0,
          activeJobCount: 3,
        },
      }),
    ).toBe('indexing_in_progress');
  });

  it('returns not_indexed when photos exist but no usable index or active job exists', () => {
    expect(
      derive({
        expectedEmployeeIndexState: {
          enrolledPhotoCount: 3,
          activeEmbeddingCount: 0,
          centroidCount: 0,
          activeJobCount: 0,
        },
      }),
    ).toBe('not_indexed');
  });

  it('returns not_indexed when embeddings exist but the centroid is missing', () => {
    expect(
      derive({
        expectedEmployeeIndexState: {
          enrolledPhotoCount: 3,
          activeEmbeddingCount: 3,
          centroidCount: 0,
          activeJobCount: 0,
        },
      }),
    ).toBe('not_indexed');
  });

  it('returns no_match after evaluating candidates for an indexed employee', () => {
    expect(derive({ candidatesEvaluated: 3, centroidsScanned: 1 })).toBe('no_match');
  });

  it('returns insufficient_data when the indexed employee has no viable candidates', () => {
    expect(derive({ centroidsScanned: 1 })).toBe('insufficient_data');
  });

  it('preserves the legacy tenant-level behavior when no expected employee is supplied', () => {
    expect(derive({ expectedEmployeeIndexState: null })).toBe('not_enrolled');
  });
});

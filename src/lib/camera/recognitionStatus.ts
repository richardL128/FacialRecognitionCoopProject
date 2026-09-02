export type RecognitionStatus =
  | 'matched'
  | 'no_match'
  | 'insufficient_data'
  | 'not_enrolled'
  | 'indexing_in_progress'
  | 'not_indexed';

export type EmployeeIndexState = {
  enrolledPhotoCount: number;
  activeEmbeddingCount: number;
  centroidCount: number;
  activeJobCount: number;
};

type DeriveRecognitionStatusInput = {
  isConfidentMatch: boolean;
  candidatesEvaluated: number;
  useCentroidPipeline: boolean;
  fallbackApplied: boolean;
  centroidsScanned: number;
  expectedEmployeeIndexState: EmployeeIndexState | null;
};

export function deriveRecognitionStatus({
  isConfidentMatch,
  candidatesEvaluated,
  useCentroidPipeline,
  fallbackApplied,
  centroidsScanned,
  expectedEmployeeIndexState,
}: DeriveRecognitionStatusInput): RecognitionStatus {
  // Preserve a positive tenant-wide match so the client can still detect when
  // the captured face conflicts with the employee verified by PIN.
  if (isConfidentMatch) {
    return 'matched';
  }

  if (expectedEmployeeIndexState) {
    if (expectedEmployeeIndexState.enrolledPhotoCount === 0) {
      return 'not_enrolled';
    }

    const hasUsableIndex =
      expectedEmployeeIndexState.activeEmbeddingCount > 0 &&
      (!useCentroidPipeline || expectedEmployeeIndexState.centroidCount > 0);

    if (!hasUsableIndex) {
      return expectedEmployeeIndexState.activeJobCount > 0 ? 'indexing_in_progress' : 'not_indexed';
    }
  }

  if (candidatesEvaluated > 0) {
    return 'no_match';
  }

  if (useCentroidPipeline && !fallbackApplied) {
    return centroidsScanned === 0 ? 'not_enrolled' : 'insufficient_data';
  }

  return 'no_match';
}

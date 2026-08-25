type EmbedResponse = {
  success: boolean;
  embedding?: number[];
  error?: {
    code?: string;
    message?: string;
  };
  detail?: string;
};

const DEFAULT_TIMEOUT_MS = 7000;

export type FaceEmbeddingErrorCode =
  | 'NO_FACE_DETECTED'
  | 'EMBEDDING_SERVICE_UNAVAILABLE'
  | 'EMBEDDING_SERVICE_FAILED';

export class FaceEmbeddingError extends Error {
  readonly code: FaceEmbeddingErrorCode;
  readonly providerStatus: number | null;

  constructor(code: FaceEmbeddingErrorCode, message: string, providerStatus: number | null = null) {
    super(message);
    this.name = 'FaceEmbeddingError';
    this.code = code;
    this.providerStatus = providerStatus;
  }
}

export function getFaceRecognizerBaseUrl(): string {
  return process.env.FACE_RECOGNIZER_URL ?? 'http://face-recognizer:8000';
}

function getTimeoutMs(): number {
  const raw = Number(process.env.FACE_RECOGNIZER_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return raw;
}

export async function getFaceEmbedding(buffer: Buffer, mimeType = 'image/jpeg'): Promise<number[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());

  try {
    const formData = new FormData();
    const imageBytes = new Uint8Array(buffer);
    formData.append('image', new Blob([imageBytes], { type: mimeType }), 'capture.jpg');

    let response: Response;
    try {
      response = await fetch(`${getFaceRecognizerBaseUrl()}/embed`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
    } catch (error) {
      const unavailableMessage =
        error instanceof Error && error.name === 'AbortError'
          ? 'Face embedding service timed out.'
          : 'Face embedding service is unavailable.';
      throw new FaceEmbeddingError('EMBEDDING_SERVICE_UNAVAILABLE', unavailableMessage);
    }

    const payload = (await response.json().catch(() => ({}))) as EmbedResponse;

    if (!response.ok || !payload.success || !payload.embedding || payload.embedding.length === 0) {
      const providerMessage =
        payload.error?.message ??
        payload.detail ??
        `Face embedding service failed (${response.status})`;
      const codeSignal = payload.error?.code?.toLowerCase() ?? '';
      const messageSignal = providerMessage.toLowerCase();
      const isNoFace =
        codeSignal.includes('no_face') ||
        messageSignal.includes('no face') ||
        messageSignal.includes('face detected');

      if (isNoFace) {
        throw new FaceEmbeddingError(
          'NO_FACE_DETECTED',
          'No face detected. Please retake the photo.',
          response.status,
        );
      }

      if (response.status >= 500 || response.status === 429) {
        throw new FaceEmbeddingError(
          'EMBEDDING_SERVICE_UNAVAILABLE',
          providerMessage,
          response.status,
        );
      }

      throw new FaceEmbeddingError('EMBEDDING_SERVICE_FAILED', providerMessage, response.status);
    }

    return payload.embedding;
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeEmbeddingVector(values: number[]): number[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Embedding vector is empty');
  }

  let sum = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new Error('Embedding vector contains non-finite values');
    }
    sum += value * value;
  }

  const norm = Math.sqrt(sum);
  if (!Number.isFinite(norm) || norm <= 0) {
    throw new Error('Embedding vector norm is invalid');
  }

  return values.map((value) => value / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return Number.NaN;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  if (normA === 0 || normB === 0) {
    return Number.NaN;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

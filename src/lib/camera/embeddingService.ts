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

function getBaseUrl(): string {
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

    const response = await fetch(`${getBaseUrl()}/embed`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => ({}))) as EmbedResponse;

    if (!response.ok || !payload.success || !payload.embedding || payload.embedding.length === 0) {
      throw new Error(
        payload.error?.message ??
          payload.detail ??
          `Face embedding service failed (${response.status})`,
      );
    }

    return payload.embedding;
  } finally {
    clearTimeout(timeout);
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return -1;
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
    return -1;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

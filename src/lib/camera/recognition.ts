import sharp from 'sharp';

const HASH_SIZE = 8;
const RESIZE_WIDTH = HASH_SIZE + 1;
const RESIZE_HEIGHT = HASH_SIZE;
const HASH_BITS = HASH_SIZE * HASH_SIZE;

export type RecognitionCandidate = {
  captureId: string;
  userId: string;
  userEmail: string;
  displayName: string;
};

export type RecognitionMatch = {
  candidate: RecognitionCandidate;
  distance: number;
  confidence: number;
};

export type RecognitionResult =
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

export async function computeDHash(buffer: Buffer): Promise<bigint> {
  const pixels = await sharp(buffer)
    .rotate()
    .grayscale()
    .resize(RESIZE_WIDTH, RESIZE_HEIGHT, { fit: 'fill' })
    .raw()
    .toBuffer();

  let hash = 0n;
  let bitIndex = 0n;

  for (let row = 0; row < RESIZE_HEIGHT; row += 1) {
    const rowOffset = row * RESIZE_WIDTH;
    for (let col = 0; col < HASH_SIZE; col += 1) {
      const left = pixels[rowOffset + col] ?? 0;
      const right = pixels[rowOffset + col + 1] ?? 0;
      if (left > right) {
        hash |= 1n << bitIndex;
      }
      bitIndex += 1n;
    }
  }

  return hash;
}

export function hammingDistance(a: bigint, b: bigint): number {
  let x = a ^ b;
  let count = 0;
  while (x !== 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

function confidenceFromDistance(distance: number): number {
  return Number((1 - distance / HASH_BITS).toFixed(4));
}

export function findBestRecognitionMatch(
  probeHash: bigint,
  candidates: Array<{ candidate: RecognitionCandidate; hash: bigint }>,
  maxDistance = 10,
): RecognitionResult {
  if (candidates.length === 0) {
    return { matched: false, best: null, candidatesEvaluated: 0 };
  }

  let best: RecognitionMatch | null = null;

  for (const entry of candidates) {
    const distance = hammingDistance(probeHash, entry.hash);
    const match: RecognitionMatch = {
      candidate: entry.candidate,
      distance,
      confidence: confidenceFromDistance(distance),
    };

    if (!best || distance < best.distance) {
      best = match;
    }
  }

  if (!best || best.distance > maxDistance) {
    return { matched: false, best, candidatesEvaluated: candidates.length };
  }

  return { matched: true, best, candidatesEvaluated: candidates.length };
}

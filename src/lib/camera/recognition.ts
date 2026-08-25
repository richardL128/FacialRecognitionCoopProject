import sharp from 'sharp';

const HASH_SIZE = 16;
const HORIZONTAL_RESIZE_WIDTH = HASH_SIZE + 1;
const HORIZONTAL_RESIZE_HEIGHT = HASH_SIZE;
const VERTICAL_RESIZE_WIDTH = HASH_SIZE;
const VERTICAL_RESIZE_HEIGHT = HASH_SIZE + 1;
const AXIS_HASH_BITS = HASH_SIZE * HASH_SIZE;
const HASH_BITS = AXIS_HASH_BITS * 2;
const MIN_DISTANCE_GAP = Math.max(4, Math.floor(HASH_BITS * 0.015));

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
  const horizontalPixels = await sharp(buffer)
    .rotate()
    .grayscale()
    .resize(HORIZONTAL_RESIZE_WIDTH, HORIZONTAL_RESIZE_HEIGHT, { fit: 'fill' })
    .raw()
    .toBuffer();

  const verticalPixels = await sharp(buffer)
    .rotate()
    .grayscale()
    .resize(VERTICAL_RESIZE_WIDTH, VERTICAL_RESIZE_HEIGHT, { fit: 'fill' })
    .raw()
    .toBuffer();

  let horizontalHash = 0n;
  let verticalHash = 0n;
  let bitIndex = 0n;

  for (let row = 0; row < HORIZONTAL_RESIZE_HEIGHT; row += 1) {
    const rowOffset = row * HORIZONTAL_RESIZE_WIDTH;
    for (let col = 0; col < HORIZONTAL_RESIZE_WIDTH - 1; col += 1) {
      const left = horizontalPixels[rowOffset + col] ?? 0;
      const right = horizontalPixels[rowOffset + col + 1] ?? 0;
      if (left > right) {
        horizontalHash |= 1n << bitIndex;
      }
      bitIndex += 1n;
    }
  }

  bitIndex = 0n;

  for (let row = 0; row < VERTICAL_RESIZE_HEIGHT - 1; row += 1) {
    const rowOffset = row * VERTICAL_RESIZE_WIDTH;
    const nextRowOffset = (row + 1) * VERTICAL_RESIZE_WIDTH;

    for (let col = 0; col < VERTICAL_RESIZE_WIDTH; col += 1) {
      const top = verticalPixels[rowOffset + col] ?? 0;
      const bottom = verticalPixels[nextRowOffset + col] ?? 0;
      if (top > bottom) {
        verticalHash |= 1n << bitIndex;
      }
      bitIndex += 1n;
    }
  }

  return horizontalHash | (verticalHash << BigInt(AXIS_HASH_BITS));
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
  maxDistance = Math.floor(HASH_BITS * 0.18),
): RecognitionResult {
  if (candidates.length === 0) {
    return { matched: false, best: null, candidatesEvaluated: 0 };
  }

  let best: RecognitionMatch | null = null;
  let secondBest: RecognitionMatch | null = null;

  for (const entry of candidates) {
    const distance = hammingDistance(probeHash, entry.hash);
    const match: RecognitionMatch = {
      candidate: entry.candidate,
      distance,
      confidence: confidenceFromDistance(distance),
    };

    if (!best || distance < best.distance) {
      secondBest = best;
      best = match;
    } else if (!secondBest || distance < secondBest.distance) {
      secondBest = match;
    }
  }

  if (!best || best.distance > maxDistance) {
    return { matched: false, best, candidatesEvaluated: candidates.length };
  }

  if (secondBest && secondBest.distance - best.distance < MIN_DISTANCE_GAP) {
    return { matched: false, best, candidatesEvaluated: candidates.length };
  }

  return { matched: true, best, candidatesEvaluated: candidates.length };
}

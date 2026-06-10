import { config as loadEnv } from 'dotenv';

type FaceEmbeddingJobRow = {
  id: string;
  tenantId: string;
  employeeProfileId: string;
  captureId: string;
  modelKey: string;
};

type EmbeddingDeps = {
  readCaptureImage: (tenantId: string, captureId: string) => Promise<Buffer>;
  getFaceEmbedding: (buffer: Buffer, mimeType?: string) => Promise<number[]>;
  normalizeEmbeddingVector: (values: number[]) => number[];
  claimNextPendingEmbeddingJob: () => Promise<FaceEmbeddingJobRow | null>;
  markEmbeddingJobFailed: (jobId: string, errorMessage: string) => Promise<void>;
  markEmbeddingJobSucceeded: (jobId: string) => Promise<void>;
  upsertFaceEmbedding: (params: {
    tenantId: string;
    employeeProfileId: string;
    captureId: string;
    modelKey: string;
    embedding: number[];
  }) => Promise<void>;
};

type CliOptions = {
  once: boolean;
  pollIntervalMs: number;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    once: false,
    pollIntervalMs: Number(process.env.FACE_EMBEDDING_POLL_INTERVAL_MS ?? 10000),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--once') {
      options.once = true;
      continue;
    }

    if (arg === '--pollIntervalMs' && next) {
      options.pollIntervalMs = Number(next);
      i += 1;
      continue;
    }
  }

  return options;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function processJob(job: FaceEmbeddingJobRow, deps: EmbeddingDeps): Promise<void> {
  const imageBuffer = await deps.readCaptureImage(job.tenantId, job.captureId);
  const embedding = await deps.getFaceEmbedding(imageBuffer);

  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error('Embedding service returned an empty vector');
  }

  await deps.upsertFaceEmbedding({
    tenantId: job.tenantId,
    employeeProfileId: job.employeeProfileId,
    captureId: job.captureId,
    modelKey: job.modelKey,
    embedding: deps.normalizeEmbeddingVector(embedding),
  });
}

async function processQueue(options: CliOptions, deps: EmbeddingDeps): Promise<void> {
  while (true) {
    const job = await deps.claimNextPendingEmbeddingJob();

    if (!job) {
      if (options.once) {
        return;
      }

      await sleep(options.pollIntervalMs);
      continue;
    }

    console.log(`[face-embedding] Processing job ${job.id} for capture ${job.captureId}`);

    try {
      await processJob(job, deps);
      await deps.markEmbeddingJobSucceeded(job.id);
      console.log(`[face-embedding] Job ${job.id} completed`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown embedding error';
      await deps.markEmbeddingJobFailed(job.id, message);
      console.error(`[face-embedding] Job ${job.id} failed: ${message}`);
    }
  }
}

async function main(): Promise<void> {
  loadEnv({ path: '.env.local' });
  loadEnv();

  const [{ readCaptureImage }, { getFaceEmbedding, normalizeEmbeddingVector }, embeddingJobs] =
    await Promise.all([
      import('../src/lib/camera/storage'),
      import('../src/lib/camera/embeddingService'),
      import('../src/lib/camera/embeddingJobs'),
    ]);

  const deps: EmbeddingDeps = {
    readCaptureImage,
    getFaceEmbedding,
    normalizeEmbeddingVector,
    claimNextPendingEmbeddingJob: embeddingJobs.claimNextPendingEmbeddingJob,
    markEmbeddingJobFailed: embeddingJobs.markEmbeddingJobFailed,
    markEmbeddingJobSucceeded: embeddingJobs.markEmbeddingJobSucceeded,
    upsertFaceEmbedding: embeddingJobs.upsertFaceEmbedding,
  };

  const options = parseArgs(process.argv.slice(2));
  await processQueue(options, deps);
}

main().catch((error) => {
  console.error('Failed to process face embedding jobs', error);
  process.exit(1);
});

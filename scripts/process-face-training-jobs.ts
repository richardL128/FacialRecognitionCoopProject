import { access, mkdir, readdir } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config as loadEnv } from 'dotenv';
import {
  claimNextPendingTrainingJob,
  markTrainingJobFailed,
  markTrainingJobSkipped,
  markTrainingJobSucceeded,
  type FaceModelTrainingJobRow,
} from '../src/lib/camera/trainingJobs';
import { getTrainingDataDirForTenant } from '../src/lib/camera/trainingDataset';

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

type CliOptions = {
  once: boolean;
  pollIntervalMs: number;
  epochs: number;
  batchSize: number;
  numWorkers: number;
  lrBackbone: number;
  lrHead: number;
  lambdaCenter: number;
};

type DatasetStats = {
  classCount: number;
  imageCount: number;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    once: false,
    pollIntervalMs: Number(process.env.FACE_TRAINING_POLL_INTERVAL_MS ?? 20000),
    epochs: Number(process.env.FACE_TRAINING_EPOCHS ?? 15),
    batchSize: Number(process.env.FACE_TRAINING_BATCH_SIZE ?? 32),
    numWorkers: Number(process.env.FACE_TRAINING_NUM_WORKERS ?? 2),
    lrBackbone: Number(process.env.FACE_TRAINING_LR_BACKBONE ?? 8e-6),
    lrHead: Number(process.env.FACE_TRAINING_LR_HEAD ?? 8e-5),
    lambdaCenter: Number(process.env.FACE_TRAINING_LAMBDA_CENTER ?? 0.18),
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

    if (arg === '--epochs' && next) {
      options.epochs = Number(next);
      i += 1;
      continue;
    }

    if (arg === '--batchSize' && next) {
      options.batchSize = Number(next);
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

async function getDatasetStats(dataDir: string): Promise<DatasetStats> {
  try {
    const entries = await readdir(dataDir, { withFileTypes: true });
    const classDirs = entries.filter((entry) => entry.isDirectory());

    let imageCount = 0;
    for (const classDir of classDirs) {
      const imageEntries = await readdir(path.join(dataDir, classDir.name), {
        withFileTypes: true,
      });
      imageCount += imageEntries.filter(
        (entry) =>
          entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()),
      ).length;
    }

    return {
      classCount: classDirs.length,
      imageCount,
    };
  } catch {
    return {
      classCount: 0,
      imageCount: 0,
    };
  }
}

function parseBestValAccuracy(trainingLog: string): number | null {
  const matches = trainingLog.match(/Accuracy:\s*([0-9]+(?:\.[0-9]+)?)%/g);
  if (!matches || matches.length === 0) {
    return null;
  }

  const last = matches[matches.length - 1] ?? '';
  const valueMatch = last.match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!valueMatch) {
    return null;
  }

  const value = Number(valueMatch[1]);
  if (!Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(4));
}

async function runFinetune(job: FaceModelTrainingJobRow, options: CliOptions): Promise<void> {
  const dataDir = job.dataDir?.trim() || getTrainingDataDirForTenant(job.tenantId);
  const outputDir = job.outputDir?.trim() || path.join(process.cwd(), 'checkpoints', job.tenantId);
  const trainerScript = path.join(process.cwd(), 'Face_Recognition', 'finetune.py');

  const stats = await getDatasetStats(dataDir);
  if (stats.classCount < 2 || stats.imageCount < 4) {
    await markTrainingJobSkipped(
      job.id,
      `Insufficient dataset: classes=${stats.classCount}, images=${stats.imageCount}. Need >=2 classes and >=4 images.`,
    );
    return;
  }

  await mkdir(outputDir, { recursive: true });

  const resumePath = path.join(outputDir, 'last_checkpoint.bin');
  let canResume = false;
  try {
    await access(resumePath, fsConstants.F_OK);
    canResume = true;
  } catch {
    canResume = false;
  }

  const args = [
    trainerScript,
    '--data_dir',
    dataDir,
    '--output_dir',
    outputDir,
    '--epochs',
    String(options.epochs),
    '--batch_size',
    String(options.batchSize),
    '--num_workers',
    String(options.numWorkers),
    '--lr_backbone',
    String(options.lrBackbone),
    '--lr_head',
    String(options.lrHead),
    '--lambda_center',
    String(options.lambdaCenter),
  ];

  if (canResume) {
    args.push('--resume', resumePath);
  }

  const logs: string[] = [];

  await new Promise<void>((resolve, reject) => {
    const child = spawn('python', args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      logs.push(text);
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      logs.push(text);
      process.stderr.write(text);
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`finetune.py exited with status ${code ?? 'unknown'}`));
      }
    });
  });

  const modelPath = path.join(outputDir, 'pytorch_model.bin');
  const checkpointPath = path.join(outputDir, 'last_checkpoint.bin');

  await markTrainingJobSucceeded(job, {
    dataDir,
    outputDir,
    modelPath,
    checkpointPath,
    datasetClassCount: stats.classCount,
    datasetImageCount: stats.imageCount,
    trainEpochs: options.epochs,
    valAccuracy: parseBestValAccuracy(logs.join('')),
  });
}

async function processQueue(options: CliOptions): Promise<void> {
  while (true) {
    const job = await claimNextPendingTrainingJob();

    if (!job) {
      if (options.once) {
        return;
      }

      await sleep(options.pollIntervalMs);
      continue;
    }

    console.log(`[face-training] Processing job ${job.id} for tenant ${job.tenantId}`);

    try {
      await runFinetune(job, options);
      console.log(`[face-training] Job ${job.id} completed`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown face training error';
      await markTrainingJobFailed(job.id, message);
      console.error(`[face-training] Job ${job.id} failed: ${message}`);
    }
  }
}

async function main(): Promise<void> {
  loadEnv({ path: '.env.local' });
  loadEnv();

  const options = parseArgs(process.argv.slice(2));
  await processQueue(options);
}

main().catch((error) => {
  console.error('Failed to process face training jobs', error);
  process.exit(1);
});

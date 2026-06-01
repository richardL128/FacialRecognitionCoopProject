import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

type CliOptions = {
  apply: boolean;
  tenantId?: string;
};

const CAMERA_UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'camera-captures');

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--apply') {
      options.apply = true;
      continue;
    }

    if (arg === '--tenantId' && next) {
      options.tenantId = next;
      i += 1;
      continue;
    }
  }

  return options;
}

function isJpegFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.jpg');
}

function captureIdFromFileName(fileName: string): string {
  return fileName.replace(/\.jpg$/i, '');
}

async function removeEmptyDirectoryIfNeeded(dirPath: string): Promise<void> {
  const remaining = await readdir(dirPath);
  if (remaining.length === 0) {
    await rm(dirPath, { recursive: true, force: true });
  }
}

async function run(): Promise<void> {
  loadEnv({ path: '.env.local' });
  loadEnv();

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run orphan capture cleanup');
  }

  const options = parseArgs(process.argv.slice(2));
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  let scannedFiles = 0;
  let orphanedFiles = 0;
  let deletedFiles = 0;
  let missingTenantDirs = 0;

  try {
    const activeCaptures = await prisma.cameraCapture.findMany({
      where: options.tenantId ? { tenantId: options.tenantId } : undefined,
      select: {
        id: true,
        tenantId: true,
      },
    });

    const activeCaptureKeys = new Set(
      activeCaptures.map((capture) => `${capture.tenantId}/${capture.id}`),
    );

    const tenantIds = options.tenantId
      ? [options.tenantId]
      : await readdir(CAMERA_UPLOAD_ROOT).catch(() => [] as string[]);

    for (const tenantId of tenantIds) {
      const tenantDir = path.join(CAMERA_UPLOAD_ROOT, tenantId);
      const fileNames = await readdir(tenantDir).catch(() => null);

      if (!fileNames) {
        missingTenantDirs += 1;
        continue;
      }

      for (const fileName of fileNames) {
        if (!isJpegFile(fileName)) {
          continue;
        }

        scannedFiles += 1;

        const captureId = captureIdFromFileName(fileName);
        const captureKey = `${tenantId}/${captureId}`;

        if (activeCaptureKeys.has(captureKey)) {
          continue;
        }

        orphanedFiles += 1;
        const imagePath = path.join(tenantDir, fileName);

        if (options.apply) {
          await rm(imagePath, { force: true });
          deletedFiles += 1;
        }
      }

      if (options.apply) {
        await removeEmptyDirectoryIfNeeded(tenantDir).catch(() => undefined);
      }
    }

    const modeLabel = options.apply ? 'APPLY' : 'DRY-RUN';
    console.log(`[camera-cleanup] Mode: ${modeLabel}`);
    console.log(`[camera-cleanup] Tenant filter: ${options.tenantId ?? 'all'}`);
    console.log(`[camera-cleanup] Active DB captures: ${activeCaptures.length}`);
    console.log(`[camera-cleanup] Scanned files: ${scannedFiles}`);
    console.log(`[camera-cleanup] Orphaned files: ${orphanedFiles}`);
    console.log(`[camera-cleanup] Deleted files: ${deletedFiles}`);
    console.log(`[camera-cleanup] Missing tenant directories: ${missingTenantDirs}`);

    if (!options.apply && orphanedFiles > 0) {
      console.log('[camera-cleanup] Re-run with --apply to delete orphaned files.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error('Failed to clean orphaned camera capture files', error);
  process.exit(1);
});

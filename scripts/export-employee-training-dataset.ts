import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

type ExportRow = {
  tenantId: string;
  employeeId: string;
  captureId: string;
};

type CliOptions = {
  tenantId?: string;
  outputDir: string;
};

function parseArgs(argv: string[]): CliOptions {
  let tenantId: string | undefined;
  let outputDir = path.join(process.cwd(), 'dataset');

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--tenantId' && next) {
      tenantId = next;
      i += 1;
      continue;
    }

    if (arg === '--outputDir' && next) {
      outputDir = path.resolve(next);
      i += 1;
      continue;
    }
  }

  return { tenantId, outputDir };
}

async function run(): Promise<void> {
  loadEnv({ path: '.env.local' });
  loadEnv();

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to export the training dataset');
  }

  const options = parseArgs(process.argv.slice(2));
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    const rows = await prisma.$queryRaw<ExportRow[]>`
      SELECT
        efl.tenant_id AS "tenantId",
        efl.employee_profile_id AS "employeeId",
        efl.capture_id AS "captureId"
      FROM employee_face_library efl
      JOIN employee_profiles ep ON ep.id = efl.employee_profile_id
      WHERE (${options.tenantId ?? null}::uuid IS NULL OR efl.tenant_id = ${options.tenantId ?? null}::uuid)
        AND ep.active = true
      ORDER BY efl.created_at DESC
    `;

    let exported = 0;
    let missingSource = 0;

    for (const row of rows) {
      const sourcePath = path.join(
        process.cwd(),
        'uploads',
        'camera-captures',
        row.tenantId,
        `${row.captureId}.jpg`,
      );

      const targetDir = path.join(options.outputDir, row.tenantId, row.employeeId);
      const targetPath = path.join(targetDir, `${row.captureId}.jpg`);

      try {
        await mkdir(targetDir, { recursive: true });
        await copyFile(sourcePath, targetPath);
        exported += 1;
      } catch {
        missingSource += 1;
      }
    }

    console.log('Dataset export completed');
    console.log(`Output directory: ${options.outputDir}`);
    console.log(`Rows scanned: ${rows.length}`);
    console.log(`Images exported: ${exported}`);
    console.log(`Missing source images: ${missingSource}`);
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error('Failed to export training dataset', error);
  process.exit(1);
});

import { config as loadEnv } from 'dotenv';

type FaceLinkRow = {
  tenantId: string;
  employeeId: string;
  captureId: string;
};

type CliOptions = {
  tenantId?: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--tenantId' && next) {
      options.tenantId = next;
      i += 1;
    }
  }

  return options;
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const { prisma } = await import('../src/lib/db/prisma');
  const { enqueueEmployeeFaceEmbeddingJob } = await import('../src/lib/camera/embeddingJobs');

  const rows = await prisma.$queryRaw<FaceLinkRow[]>`
    SELECT
      efl.tenant_id AS "tenantId",
      efl.employee_profile_id AS "employeeId",
      efl.capture_id AS "captureId"
    FROM employee_face_library efl
    JOIN employee_profiles ep ON ep.id = efl.employee_profile_id
    WHERE ep.active = true
      AND (${options.tenantId ?? null}::uuid IS NULL OR efl.tenant_id = ${options.tenantId ?? null}::uuid)
    ORDER BY efl.created_at DESC
  `;

  let enqueued = 0;
  let deduped = 0;

  for (const row of rows) {
    const result = await enqueueEmployeeFaceEmbeddingJob(
      row.tenantId,
      row.employeeId,
      row.captureId,
      null,
      'backfill_existing_employee_faces',
    );

    if (result.enqueued) {
      enqueued += 1;
    } else {
      deduped += 1;
    }
  }

  console.log('Face embedding backfill completed');
  console.log(`Rows scanned: ${rows.length}`);
  console.log(`Jobs enqueued: ${enqueued}`);
  console.log(`Already queued: ${deduped}`);
}

async function main(): Promise<void> {
  loadEnv({ path: '.env.local' });
  loadEnv();

  await run();
}

main().catch((error) => {
  console.error('Failed to backfill face embedding jobs', error);
  process.exit(1);
});

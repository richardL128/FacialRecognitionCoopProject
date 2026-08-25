/**
 * One-shot script: deactivates face_embeddings rows whose capture is no longer linked
 * in employee_face_library, then removes the corresponding stale centroids.
 *
 * Run once to fix ghost embeddings created by the enroll→remove race condition.
 *
 * Usage:
 *   npx tsx scripts/cleanup-ghost-embeddings.ts
 */
import { config as loadEnv } from 'dotenv';
import { prisma } from '../src/lib/db/prisma';
import { removeEmployeeCentroid } from '../src/lib/camera/centroidService';
import { getEmbeddingModelKey } from '../src/lib/camera/embeddingJobs';

loadEnv({ path: '.env.local' });
loadEnv();

async function main(): Promise<void> {
  const modelKey = getEmbeddingModelKey();

  // 1. Find and deactivate ghost embeddings (captures not in employee_face_library).
  type GhostRow = { captureId: string; tenantId: string; employeeProfileId: string };
  const ghosts = await prisma.$queryRaw<GhostRow[]>`
    UPDATE face_embeddings fe
    SET active = false, updated_at = now()
    WHERE NOT EXISTS (
      SELECT 1 FROM employee_face_library efl
      WHERE efl.capture_id = fe.capture_id
    )
    AND active = true
    RETURNING
      fe.capture_id           AS "captureId",
      fe.tenant_id            AS "tenantId",
      fe.employee_profile_id  AS "employeeProfileId"
  `;

  if (ghosts.length === 0) {
    console.log('No ghost embeddings found — nothing to clean up.');
    await prisma.$disconnect();
    return;
  }

  console.log(`Deactivated ${ghosts.length} ghost embedding(s):`);
  for (const g of ghosts) {
    console.log(`  capture=${g.captureId}  employee=${g.employeeProfileId}  tenant=${g.tenantId}`);
  }

  // 2. For each affected employee, check if they still have active embeddings.
  //    If not, delete the now-stale centroid.
  const seen = new Set<string>();
  for (const g of ghosts) {
    const key = `${g.tenantId}:${g.employeeProfileId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    type CountRow = { remaining: number };
    const rows = await prisma.$queryRaw<CountRow[]>`
      SELECT count(*) AS remaining
      FROM face_embeddings
      WHERE tenant_id           = ${g.tenantId}::uuid
        AND employee_profile_id = ${g.employeeProfileId}::uuid
        AND model_key           = ${modelKey}
        AND active              = true
        AND embedding_vec       IS NOT NULL
    `;

    const remaining = Number(rows[0]?.remaining ?? 0);
    if (remaining === 0) {
      await removeEmployeeCentroid(g.tenantId, g.employeeProfileId, modelKey);
      console.log(`  → Removed stale centroid for employee=${g.employeeProfileId}`);
    } else {
      console.log(
        `  → Employee ${g.employeeProfileId} still has ${remaining} active embedding(s); centroid kept.`,
      );
    }
  }

  console.log('Done.');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('cleanup-ghost-embeddings failed:', err);
  process.exit(1);
});

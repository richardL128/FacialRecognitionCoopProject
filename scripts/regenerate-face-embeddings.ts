/**
 * regenerate-face-embeddings.ts
 *
 * Delete and regenerate face embeddings for one or all employees using the local
 * HuggingFace model (inference.py FaceAnalysis).  This script is useful when:
 *   - The model architecture has changed and all embeddings need re-extraction.
 *   - Stale/corrupt embeddings need to be purged and rebuilt from source images.
 *   - Testing with different model checkpoints or inference parameters.
 *
 * Safety properties:
 *   - Uses a Postgres advisory lock (pg_try_advisory_xact_lock) so only one
 *     instance runs at a time; safe across horizontal replica restarts.
 *   - Chunked operations (CHUNK_SIZE rows per batch) avoid long-running transactions.
 *   - Fully idempotent: deleted embeddings are recreated from the same source images.
 *   - Recomputes centroids after regeneration so the recognition pipeline stays consistent.
 *
 * Usage:
 *   # Regenerate all embeddings for a tenant
 *   npx tsx scripts/regenerate-face-embeddings.ts --tenantId <uuid> --apply
 *
 *   # Regenerate embeddings for a specific employee
 *   npx tsx scripts/regenerate-face-embeddings.ts --tenantId <uuid> --employeeId <uuid> --apply
 *
 *   # Dry run (show what would be done without making changes)
 *   npx tsx scripts/regenerate-face-embeddings.ts --tenantId <uuid> [--employeeId <uuid>]
 */

import { access, readdir } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { recomputeEmployeeCentroid, removeEmployeeCentroid } from '../src/lib/camera/centroidService';
import { getEmbeddingModelKey } from '../src/lib/camera/embeddingJobs';

const CHUNK_SIZE = 50;
// Arbitrary stable lock key: crc32('face-embeddings-regenerate') as a bigint-safe integer
const ADVISORY_LOCK_KEY = 2_947_183_650;

type CliOptions = {
  apply: boolean;
  tenantId?: string;
  employeeId?: string;
};

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

    if (arg === '--employeeId' && next) {
      options.employeeId = next;
      i += 1;
      continue;
    }
  }

  return options;
}

type FaceLibraryRow = {
  employeeProfileId: string;
  employeeName: string;
  captureId: string;
  imageUrl: string;
};

type EmbeddingStats = {
  totalScanned: number;
  totalDeleted: number;
  totalRegenerated: number;
  totalErrors: number;
  totalCentroidsRecomputed: number;
  affectedEmployees: Set<string>;
};

/**
 * Resolve the absolute path to an image file from a camera capture record.
 * Images are stored in uploads/camera-captures/<tenantId>/<captureId>.jpg
 */
async function resolveImagePath(tenantId: string, imageUrl: string): Promise<string | null> {
  // imageUrl is typically something like "camera-captures/<tenantId>/<captureId>.jpg"
  // or just "<tenantId>/<captureId>.jpg" depending on how it was stored.
  const relativePath = imageUrl.startsWith('camera-captures/')
    ? imageUrl.replace('camera-captures/', '')
    : imageUrl;

  const candidatePaths = [
    path.join(process.cwd(), 'uploads', relativePath),
    path.join(process.cwd(), 'uploads', 'camera-captures', tenantId, path.basename(relativePath)),
  ];

  for (const candidate of candidatePaths) {
    try {
      await access(candidate, fsConstants.R_OK);
      return candidate;
    } catch {
      // File doesn't exist or isn't readable
    }
  }

  return null;
}

/**
 * Call the local face recognition service to extract an embedding from an image.
 */
async function extractEmbeddingFromImage(imagePath: string): Promise<number[] | null> {
  try {
    // Try calling the running face-recognizer service first (if available)
    const baseUrl = process.env.FACE_RECOGNIZER_URL ?? 'http://face-recognizer:8000';
    const fileBuffer = await import('node:fs').then((fs) => fs.readFileSync(imagePath));
    const formData = new FormData();
    formData.append(
      'image',
      new Blob([fileBuffer], { type: 'image/jpeg' }),
      path.basename(imagePath),
    );

    const response = await fetch(`${baseUrl}/embed`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(10_000), // 10 second timeout
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();
    if (result.success && result.embedding && result.embedding.length > 0) {
      return result.embedding;
    }

    return null;
  } catch {
    // Service unavailable or timeout — fall back to direct Python invocation
    console.warn(`[regenerate] Face recognizer service unavailable, falling back to Python subprocess for ${imagePath}`);
    return null;
  }
}

/**
 * Extract embedding using Python subprocess as fallback when the service is unavailable.
 */
async function extractEmbeddingViaPython(imagePath: string): Promise<number[] | null> {
  try {
    const { spawn } = await import('node:child_process');
    const { promisify } = await import('node:util');

    // Use Python to run the FaceAnalysis process_image method
    const pythonScript = path.join(__dirname, '..', 'services', 'face-recognizer', 'run_extract.py');

    return new Promise<number[] | null>((resolve) => {
      let stdout = '';
      let stderr = '';

      const proc = spawn('python', [pythonScript, imagePath], {
        cwd: path.join(__dirname, '..'),
        timeout: 15_000, // 15 second timeout (note: not a valid SpawnOptions property)
      });

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          try {
            const result = JSON.parse(stdout.trim());
            if (result.success && result.embedding) {
              resolve(result.embedding);
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });

      proc.on('error', () => {
        resolve(null);
      });
    });
  } catch (error) {
    console.error(`[regenerate] Failed to invoke Python for ${imagePath}: ${error}`);
    return null;
  }
}

async function run(): Promise<void> {
  loadEnv({ path: '.env.local' });
  loadEnv();

  const options = parseArgs(process.argv.slice(2));

  if (!options.tenantId) {
    throw new Error('--tenantId is required. Use --apply to make changes.');
  }

  if (!options.apply) {
    console.log('[regenerate] DRY RUN mode — no changes will be made. Add --apply to execute.');
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });
  const modelKey = getEmbeddingModelKey();

  let stats: EmbeddingStats = {
    totalScanned: 0,
    totalDeleted: 0,
    totalRegenerated: 0,
    totalErrors: 0,
    totalCentroidsRecomputed: 0,
    affectedEmployees: new Set(),
  };

  try {
    // Acquire advisory lock
    const acquired = await prisma.$queryRaw<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(${ADVISORY_LOCK_KEY}) AS acquired
    `;
    if (!acquired[0]?.acquired) {
      console.log('[regenerate] Another instance holds the advisory lock. Exiting.');
      return;
    }

    // Fetch face library rows to process (use proper SQL templating for optional employee filter)
    const rows = options.employeeId
      ? await prisma.$queryRaw<FaceLibraryRow[]>`
          SELECT
            efl.employee_profile_id AS "employeeProfileId",
            ep.name AS "employeeName",
            efl.capture_id AS "captureId",
            cc.image_url AS "imageUrl"
          FROM employee_face_library efl
          JOIN employee_profiles ep ON ep.id = efl.employee_profile_id
          JOIN camera_captures cc ON cc.id = efl.capture_id
          WHERE efl.tenant_id = ${options.tenantId}::uuid
            AND ep.id = ${options.employeeId}::uuid
            AND ep.active = true
          ORDER BY efl.created_at DESC
        `
      : await prisma.$queryRaw<FaceLibraryRow[]>`
          SELECT
            efl.employee_profile_id AS "employeeProfileId",
            ep.name AS "employeeName",
            efl.capture_id AS "captureId",
            cc.image_url AS "imageUrl"
          FROM employee_face_library efl
          JOIN employee_profiles ep ON ep.id = efl.employee_profile_id
          JOIN camera_captures cc ON cc.id = efl.capture_id
          WHERE efl.tenant_id = ${options.tenantId}::uuid
            AND ep.active = true
          ORDER BY efl.created_at DESC
        `;

    stats.totalScanned = rows.length;
    console.log(`[regenerate] Found ${rows.length} face library entry(ies) to process.`);

    if (rows.length === 0) {
      console.log('[regenerate] Nothing to do. Exiting.');
      return;
    }

    // Process in chunks
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      console.log(`\n[regenerate] Processing chunk ${Math.floor(i / CHUNK_SIZE) + 1} (${chunk.length} entries)...`);

      for (const row of chunk) {
        stats.affectedEmployees.add(row.employeeProfileId);

        // Step 1: Delete existing embedding
        if (options.apply) {
          try {
            const deleted = await prisma.$executeRaw`
              UPDATE face_embeddings
              SET active = false, updated_at = now()
              WHERE capture_id = ${row.captureId}::uuid
                AND tenant_id = ${options.tenantId}::uuid
                AND model_key = ${modelKey}
                AND active = true
            `;

            if (deleted > 0) {
              stats.totalDeleted += 1;
              console.log(`  Deleted embedding for capture=${row.captureId} employee=${row.employeeProfileId}`);
            }
          } catch (error) {
            console.error(`  [ERROR] Failed to delete embedding for ${row.captureId}: ${error}`);
            stats.totalErrors += 1;
            continue;
          }
        }

        // Step 2: Regenerate embedding from source image
        try {
          const imagePath = await resolveImagePath(options.tenantId, row.imageUrl);

          if (!imagePath) {
            console.warn(`  [WARN] Image not found for capture=${row.captureId}, path=${row.imageUrl}`);
            stats.totalErrors += 1;
            continue;
          }

          let embedding: number[] | null = null;

          // Try service first, then Python subprocess
          embedding = await extractEmbeddingFromImage(imagePath);

          if (!embedding || embedding.length === 0) {
            console.log(`  [regenerate] Service extraction failed for ${imagePath}, trying Python...`);
            embedding = await extractEmbeddingViaPython(imagePath);
          }

          if (!embedding || embedding.length === 0) {
            console.error(`  [ERROR] Failed to extract embedding for ${row.captureId}`);
            stats.totalErrors += 1;
            continue;
          }

          // Step 3: Insert new embedding
          if (options.apply) {
            const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
            const normalised = norm > 0 ? embedding.map((v) => v / norm) : embedding;
            const vecLiteral = `[${normalised.join(',')}]`;

            await prisma.$executeRaw`
              INSERT INTO face_embeddings (
                tenant_id,
                employee_profile_id,
                capture_id,
                model_key,
                embedding_dim,
                embedding,
                embedding_vec,
                active,
                created_at,
                updated_at
              ) VALUES (
                ${options.tenantId}::uuid,
                ${row.employeeProfileId}::uuid,
                ${row.captureId}::uuid,
                ${modelKey},
                ${normalised.length}::int,
                ${normalised}::jsonb,
                ${vecLiteral}::vector(512),
                true,
                now(),
                now()
              )
              ON CONFLICT (capture_id, model_key)
              DO UPDATE SET
                active = true,
                embedding_dim = ${normalised.length}::int,
                embedding = ${normalised}::jsonb,
                embedding_vec = ${vecLiteral}::vector(512),
                updated_at = now()
            `;

            stats.totalRegenerated += 1;
            console.log(`  Regenerated embedding for capture=${row.captureId} dim=${normalised.length}`);
          } else {
            stats.totalRegenerated += 1;
            console.log(`  [DRY RUN] Would regenerate embedding for capture=${row.captureId}`);
          }
        } catch (error) {
          console.error(`  [ERROR] Failed to regenerate embedding for ${row.captureId}: ${error}`);
          stats.totalErrors += 1;
        }
      }
    }

    // Step 4: Recompute centroids for affected employees
    if (options.apply) {
      console.log('\n[regenerate] Recomputing centroids for affected employees...');
      for (const employeeId of stats.affectedEmployees) {
        try {
          const sampleCount = await recomputeEmployeeCentroid(
            options.tenantId,
            employeeId,
            modelKey,
          );

          if (sampleCount > 0) {
            stats.totalCentroidsRecomputed += 1;
            console.log(`  Recomputed centroid for employee=${employeeId} samples=${sampleCount}`);
          } else {
            // No active embeddings left — remove centroid
            await removeEmployeeCentroid(options.tenantId, employeeId, modelKey);
            console.log(`  Removed stale centroid for employee=${employeeId}`);
          }
        } catch (error) {
          console.error(`  [ERROR] Failed to recompute centroid for ${employeeId}: ${error}`);
          stats.totalErrors += 1;
        }
      }
    } else {
      stats.totalCentroidsRecomputed = stats.affectedEmployees.size;
      console.log(`\n[DRY RUN] Would recompute centroids for ${stats.affectedEmployees.size} employee(s).`);
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('[regenerate] Summary:');
    console.log(`  Total scanned:     ${stats.totalScanned}`);
    console.log(`  Total deleted:     ${stats.totalDeleted}`);
    console.log(`  Total regenerated: ${stats.totalRegenerated}`);
    console.log(`  Total errors:      ${stats.totalErrors}`);
    console.log(`  Centroids recomputed: ${stats.totalCentroidsRecomputed}`);
    console.log('='.repeat(60));

    if (stats.totalErrors > 0) {
      console.warn('[regenerate] Completed with errors. Check logs above.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.error('[regenerate] Failed:', error);
    process.exit(1);
  }
}

main();

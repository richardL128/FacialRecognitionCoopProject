import { mkdir, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readCaptureImage } from '@/lib/camera/storage';

const DEFAULT_DATASET_ROOT = path.join(process.cwd(), 'dataset');

export function getTrainingDatasetRoot(): string {
  const configured = process.env.FACE_TRAINING_DATASET_ROOT?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_DATASET_ROOT;
}

export function getTrainingDataDirForTenant(tenantId: string): string {
  return path.join(getTrainingDatasetRoot(), tenantId);
}

function getEmployeeDatasetDir(tenantId: string, employeeId: string): string {
  return path.join(getTrainingDataDirForTenant(tenantId), employeeId);
}

function getEmployeeDatasetImagePath(
  tenantId: string,
  employeeId: string,
  captureId: string,
): string {
  return path.join(getEmployeeDatasetDir(tenantId, employeeId), `${captureId}.jpg`);
}

export async function syncEmployeeCaptureToTrainingDataset(
  tenantId: string,
  employeeId: string,
  captureId: string,
): Promise<void> {
  const imageBuffer = await readCaptureImage(tenantId, captureId);
  const employeeDir = getEmployeeDatasetDir(tenantId, employeeId);

  await mkdir(employeeDir, { recursive: true });
  await writeFile(getEmployeeDatasetImagePath(tenantId, employeeId, captureId), imageBuffer, {
    flag: 'w',
  });
}

export async function removeEmployeeCaptureFromTrainingDataset(
  tenantId: string,
  employeeId: string,
  captureId: string,
): Promise<void> {
  const imagePath = getEmployeeDatasetImagePath(tenantId, employeeId, captureId);

  try {
    await unlink(imagePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      throw error;
    }
  }

  const employeeDir = getEmployeeDatasetDir(tenantId, employeeId);
  try {
    const remaining = await readdir(employeeDir);
    if (remaining.length === 0) {
      await rm(employeeDir, { recursive: true, force: true });
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      throw error;
    }
  }
}

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CAMERA_UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'camera-captures');

function getCaptureImagePath(tenantId: string, captureId: string): string {
  return path.join(CAMERA_UPLOAD_ROOT, tenantId, `${captureId}.jpg`);
}

export async function writeCaptureImage(
  tenantId: string,
  captureId: string,
  imageBuffer: Buffer,
): Promise<void> {
  const tenantDirectory = path.join(CAMERA_UPLOAD_ROOT, tenantId);
  await mkdir(tenantDirectory, { recursive: true });
  await writeFile(getCaptureImagePath(tenantId, captureId), imageBuffer, { flag: 'w' });
}

export async function readCaptureImage(tenantId: string, captureId: string): Promise<Buffer> {
  return readFile(getCaptureImagePath(tenantId, captureId));
}

export function buildCaptureImageUrl(captureId: string): string {
  return `/api/camera/captures/${captureId}/image`;
}

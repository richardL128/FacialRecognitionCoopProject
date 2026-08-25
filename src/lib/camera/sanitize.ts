import sharp from 'sharp';
import { AppError } from '@/lib/errors';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_UPLOAD_BYTES,
  type AllowedImageMimeType,
} from '@/lib/camera/constants';

const MAX_INPUT_PIXELS = 40_000_000;

type SanitizedImage = {
  buffer: Buffer;
  mimeType: 'image/jpeg';
  extension: 'jpg';
};

function detectMimeFromMagic(buffer: Buffer): AllowedImageMimeType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

export async function sanitizeImageUpload(
  rawBuffer: Buffer,
  mimeType: string,
): Promise<SanitizedImage> {
  if (rawBuffer.length === 0) {
    throw AppError.badRequest('Image payload is empty', 'VALIDATION_ERROR');
  }

  if (rawBuffer.length > MAX_IMAGE_UPLOAD_BYTES) {
    throw AppError.badRequest('Image exceeds 5MB limit', 'VALIDATION_ERROR');
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType as AllowedImageMimeType)) {
    throw AppError.badRequest('Unsupported image MIME type', 'VALIDATION_ERROR');
  }

  const detectedMimeType = detectMimeFromMagic(rawBuffer);
  if (!detectedMimeType || detectedMimeType !== mimeType) {
    throw AppError.badRequest('Invalid image signature', 'VALIDATION_ERROR');
  }

  const sanitizedBuffer = await sharp(rawBuffer, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({
      width: 1920,
      height: 1920,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  return {
    buffer: sanitizedBuffer,
    mimeType: 'image/jpeg',
    extension: 'jpg',
  };
}

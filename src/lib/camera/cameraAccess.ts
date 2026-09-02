/**
 * Shared getUserMedia access for the camera screens.
 *
 * Both camera pages previously used a bare `catch {}` and reported every
 * failure as "check browser permissions", which is wrong for most of the ways
 * getUserMedia can fail — and actively misleading when the block comes from
 * our own Permissions-Policy header rather than from a user setting.
 */

/** Turn a getUserMedia failure into something a human can act on. */
export function describeCameraError(error: unknown): string {
  if (typeof navigator !== 'undefined' && !navigator.mediaDevices) {
    const origin = typeof location !== 'undefined' ? location.origin : 'this origin';
    return `The camera needs a secure origin. This page is served from ${origin} — use https:// or localhost.`;
  }

  const name = error instanceof Error ? error.name : '';

  switch (name) {
    case 'NotAllowedError':
      return 'Camera access was denied. If no permission prompt appeared, the page’s Permissions-Policy header may be blocking it — check the browser console.';
    case 'NotFoundError':
      return 'No camera was detected on this device.';
    case 'NotReadableError':
      return 'The camera is already in use by another application. Close it and try again.';
    case 'OverconstrainedError':
      return 'No camera matches the requested settings.';
    case 'SecurityError':
      return 'Camera access is blocked by this browser’s security policy.';
    default:
      return `Unable to start the camera${name ? ` (${name})` : ''}. See the browser console for details.`;
  }
}

/**
 * Request a camera stream, falling back to any available camera when the
 * preferred facing mode is unavailable (e.g. 'environment' on a laptop, which
 * has no rear camera).
 */
export async function requestCameraStream(
  facingMode: 'user' | 'environment',
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new TypeError('navigator.mediaDevices is unavailable (insecure origin?)');
  }

  const video = { width: { ideal: 1280 }, height: { ideal: 720 } };

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { ...video, facingMode },
      audio: false,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'OverconstrainedError') {
      return navigator.mediaDevices.getUserMedia({ video, audio: false });
    }
    throw error;
  }
}

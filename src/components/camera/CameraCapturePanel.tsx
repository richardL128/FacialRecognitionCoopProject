'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH, sanitizePinInput } from '@/lib/auth/pinSanitization';
import { describeCameraError, requestCameraStream } from '@/lib/camera/cameraAccess';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

type UploadState = 'idle' | 'capturing' | 'uploading' | 'success' | 'error';

/** Carries the API error code through the catch so it can drive recovery, not just wording. */
class RecognitionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RecognitionError';
    this.code = code;
  }
}

/** Operator-facing wording for the error codes /api/camera/recognize can return. */
const RECOGNITION_ERROR_MESSAGES: Record<string, string> = {
  NO_FACE_DETECTED: 'No face detected. Please retake your photo.',
  EMBEDDING_SERVICE_UNAVAILABLE: 'Face service unavailable. Please try again shortly.',
  EMBEDDING_SERVICE_FAILED: 'Face service could not process this photo. Please retake it.',
  RECOGNITION_FAILED: 'Face recognition failed. Please try again.',
};

type UploadResponse = {
  success: boolean;
  data?: {
    captureId: string;
    imageUrl: string;
  };
  error?: {
    code: string;
    message: string;
  };
};

type RecognitionResponse = {
  success: boolean;
  data?: {
    matched: boolean;
    status:
      | 'matched'
      | 'no_match'
      | 'insufficient_data'
      | 'not_enrolled'
      | 'indexing_in_progress'
      | 'not_indexed';
    confidence: number | null;
    distance: number | null;
    candidatesEvaluated: number;
    thresholds: {
      minConfidence: number;
    };
    topCandidate: {
      captureId: string;
      userId: string;
      email: string;
      displayName: string;
      confidence: number;
      distance: number;
    } | null;
    match: {
      captureId: string;
      userId: string;
      email: string;
      displayName: string;
    } | null;
  };
  error?: {
    code: string;
    message: string;
  };
};

type PinVerifyResponse = {
  success: boolean;
  data?: {
    employeeId: string;
    firstName: string;
    displayName: string;
    email: string | null;
  };
  error?: {
    code: string;
    message: string;
  };
};

type VerifiedEmployee = {
  employeeId: string;
  displayName: string;
};

// ─── PIN Entry Overlay ───────────────────────────────────────────────────────

function PinEntryOverlay({ onVerified }: { onVerified: (employee: VerifiedEmployee) => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const MAX_ATTEMPTS = 5;

  // Block non-numeric key presses at the keyboard level (preserve control keys)
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const allowed = [
      'Backspace',
      'Delete',
      'Tab',
      'Escape',
      'Enter',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
    ];
    if (allowed.includes(e.key)) return;
    if (e.ctrlKey || e.metaKey) return; // allow copy/paste/select-all shortcuts
    if (!/^\d$/.test(e.key)) {
      e.preventDefault();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    setError(null);
    setPin((prev) => sanitizePinInput(prev + pasted));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sanitizedPin = sanitizePinInput(pin);
    if (sanitizedPin.length < PIN_MIN_LENGTH) return;

    if (sanitizedPin !== pin) {
      setPin(sanitizedPin);
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/camera/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinCode: sanitizedPin }),
      });
      const payload = (await response.json()) as PinVerifyResponse;
      if (response.ok && payload.success && payload.data) {
        onVerified({
          employeeId: payload.data.employeeId,
          displayName: payload.data.displayName,
        });
      } else {
        const next = attempts + 1;
        setAttempts(next);
        setPin('');
        if (next >= MAX_ATTEMPTS) {
          setError(`Too many failed attempts. Please contact an administrator.`);
        } else {
          setError(
            payload.error?.message ??
              `Incorrect PIN. ${MAX_ATTEMPTS - next} attempt${MAX_ATTEMPTS - next === 1 ? '' : 's'} remaining.`,
          );
        }
      }
    } catch {
      setError('PIN verification failed. Please try again.');
      setPin('');
    } finally {
      setLoading(false);
    }
  }

  const locked = attempts >= MAX_ATTEMPTS;

  return (
    <div className="w-full min-h-[calc(100dvh-13rem)] rounded-xl border border-[rgb(var(--pe-grey-20))] bg-[rgb(var(--pe-primary))] p-6 shadow-sm flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-[rgb(var(--pe-grey-20))] bg-[rgb(var(--pe-ice))] p-8 text-center shadow-sm">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: 'rgb(var(--pe-blue-10))' }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgb(var(--pe-blue-100))"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2 className="pe-h4 mb-1" style={{ color: 'rgb(var(--pe-grey-100))' }}>
            Enter Your PIN
          </h2>
          <p className="pe-body mb-6" style={{ color: 'rgb(var(--pe-grey-70))' }}>
            Enter your employee PIN to access the camera.
          </p>

          {locked ? (
            <div
              className="rounded-md px-3 py-2"
              style={{ background: 'rgb(var(--pe-red-10))', color: 'rgb(var(--pe-red-100))' }}
            >
              <p className="pe-body">{error}</p>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,6}"
                maxLength={PIN_MAX_LENGTH}
                autoComplete="one-time-code"
                value={pin}
                onChange={(e) => {
                  setError(null);
                  setPin(sanitizePinInput(e.target.value));
                }}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="● ● ● ●"
                className="pe-grid-input w-full text-center text-2xl tracking-[0.5em]"
                autoFocus
                disabled={loading}
              />
              {error && (
                <p className="pe-small" style={{ color: 'rgb(var(--pe-red-100))' }}>
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading || sanitizePinInput(pin).length < PIN_MIN_LENGTH}
                className="w-full rounded-md border border-[rgb(var(--pe-blue-100))] bg-[rgb(var(--pe-blue-100))] px-4 py-2 pe-btn text-[rgb(var(--pe-grey-5))] transition-colors hover:bg-[rgb(var(--pe-blue-80))] disabled:cursor-not-allowed disabled:border-[rgb(var(--pe-grey-20))] disabled:bg-[rgb(var(--pe-grey-20))] disabled:text-[rgb(var(--pe-grey-60))]"
              >
                {loading ? 'Verifying…' : 'Continue'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CameraCapturePanel() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [verifiedEmployee, setVerifiedEmployee] = useState<VerifiedEmployee | null>(null);
  const [state, setState] = useState<UploadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [captureImageUrl, setCaptureImageUrl] = useState<string | null>(null);
  const [recognitionLoading, setRecognitionLoading] = useState(false);
  const [recognitionResult, setRecognitionResult] = useState<RecognitionResponse['data'] | null>(
    null,
  );

  const { enabled: cameraEnabled, loading: cameraFlagLoading } = useFeatureFlag(
    'CAMERA_CAPTURE_ENABLED',
    true,
  );

  const runRecognition = useCallback(
    async (imageBlob: Blob, excludeCaptureId?: string, expectedEmployeeId?: string) => {
      setRecognitionLoading(true);
      try {
        const formData = new FormData();
        const file = new File([imageBlob], 'recognize.jpg', { type: 'image/jpeg' });
        formData.append('image', file);
        if (excludeCaptureId) {
          formData.append('excludeCaptureId', excludeCaptureId);
        }
        if (expectedEmployeeId) {
          formData.append('expectedEmployeeId', expectedEmployeeId);
        }

        const response = await fetch('/api/camera/recognize', {
          method: 'POST',
          body: formData,
        });
        const payload = (await response.json()) as RecognitionResponse;

        if (!response.ok || !payload.success || !payload.data) {
          throw new RecognitionError(
            payload.error?.code ?? 'RECOGNITION_FAILED',
            RECOGNITION_ERROR_MESSAGES[payload.error?.code ?? ''] ??
              payload.error?.message ??
              'Recognition failed. Please try again.',
          );
        }

        setRecognitionResult(payload.data);
      } catch (error) {
        setRecognitionResult(null);
        const code = error instanceof RecognitionError ? error.code : 'RECOGNITION_FAILED';
        const message =
          error instanceof Error ? error.message : 'Recognition failed. Please try again.';

        // Every failure must move the panel into 'error' — the status banner only
        // renders errorMessage in that state, so setting the message alone leaves the
        // green "captured successfully" banner from the upload standing and the failure
        // invisible.
        setState('error');
        setErrorMessage(message);

        // Only a rejected photo is worth discarding. A service outage says nothing
        // about the capture itself, so keep it on screen for the retry.
        if (code === 'NO_FACE_DETECTED') {
          setCaptureImageUrl(null);
          setPreviewDataUrl(null);
        }
      } finally {
        setRecognitionLoading(false);
      }
    },
    [],
  );

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setErrorMessage(null);
    setState('capturing');

    try {
      const stream = await requestCameraStream('environment');

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      console.error('Camera start failed', error);
      setState('error');
      setErrorMessage(describeCameraError(error));
    }
  }, []);

  const captureAndUpload = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) {
      setState('error');
      setErrorMessage('Camera is not ready yet.');
      return;
    }

    setErrorMessage(null);
    setState('uploading');

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      setState('error');
      setErrorMessage('Unable to prepare capture.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const preview = canvas.toDataURL('image/jpeg', 0.9);
    setPreviewDataUrl(preview);

    const imageBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9);
    });

    if (!imageBlob) {
      setState('error');
      setErrorMessage('Unable to read captured image.');
      return;
    }

    const imageFile = new File([imageBlob], 'capture.jpg', { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('source', 'dashboard');

    try {
      const response = await fetch('/api/camera/upload', {
        method: 'POST',
        body: formData,
      });

      const payload = (await response.json()) as UploadResponse;

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error?.message ?? 'Upload failed');
      }

      stopStream();
      setCaptureImageUrl(payload.data.imageUrl);
      setState('success');
      await runRecognition(imageBlob, payload.data.captureId, verifiedEmployee?.employeeId);
    } catch (error) {
      setState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Upload failed');
    }
  }, [runRecognition, stopStream, verifiedEmployee?.employeeId]);

  const resetCapture = useCallback(() => {
    setCaptureImageUrl(null);
    setPreviewDataUrl(null);
    setState('idle');
    setErrorMessage(null);
    setRecognitionResult(null);
  }, []);

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  // ── Face-guide overlay ────────────────────────────────────────────
  useEffect(() => {
    if (state !== 'capturing') return;
    const canvas = overlayRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    function drawGuide() {
      if (!canvas || !container) return;
      const { width, height } = container.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height * 0.46;
      const rx = width * 0.28;
      const ry = height * 0.42;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.90)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      const ticks: [number, number, number, number][] = [
        [cx, cy - ry - 6, cx, cy - ry + 12],
        [cx, cy + ry + 6, cx, cy + ry - 12],
        [cx - rx - 6, cy, cx - rx + 12, cy],
        [cx + rx + 6, cy, cx + rx - 12, cy],
      ];
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1.5;
      for (const [x1, y1, x2, y2] of ticks) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      const labelY = cy + ry + 22;
      ctx.font = `${Math.max(11, width * 0.028)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillText('Position your face within the oval', cx + 1, labelY + 1);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fillText('Position your face within the oval', cx, labelY);
    }
    drawGuide();
    const observer = new ResizeObserver(drawGuide);
    observer.observe(container);
    return () => observer.disconnect();
  }, [state]);

  const statusText = useMemo(() => {
    if (state === 'uploading') return 'Uploading and sanitizing image...';
    if (state === 'success') return 'Image captured and stored successfully.';
    if (state === 'error') return errorMessage ?? 'Something went wrong.';
    if (state === 'capturing') return 'Camera is active. Capture when ready.';
    return 'Start camera to capture an image.';
  }, [errorMessage, state]);

  if (cameraFlagLoading) {
    return (
      <div className="w-full min-h-[calc(100dvh-13rem)] rounded-xl border border-[rgb(var(--pe-grey-20))] bg-[rgb(var(--pe-primary))] p-6 shadow-sm">
        <p className="pe-body" style={{ color: 'rgb(var(--pe-grey-70))' }}>
          Loading camera feature...
        </p>
      </div>
    );
  }

  if (!cameraEnabled) {
    return (
      <div className="w-full min-h-[calc(100dvh-13rem)] rounded-xl border border-[rgb(var(--pe-grey-20))] bg-[rgb(var(--pe-primary))] p-6 shadow-sm">
        <h1 className="pe-h2" style={{ color: 'rgb(var(--pe-grey-100))' }}>
          Feature Unavailable
        </h1>
        <p className="pe-body mt-2" style={{ color: 'rgb(var(--pe-grey-70))' }}>
          Camera capture is currently disabled for your account.
        </p>
      </div>
    );
  }

  if (!verifiedEmployee) {
    return <PinEntryOverlay onVerified={setVerifiedEmployee} />;
  }

  return (
    <div className="w-full min-h-[calc(100dvh-13rem)] rounded-xl border border-[rgb(var(--pe-grey-20))] bg-[rgb(var(--pe-primary))] p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="pe-h2" style={{ color: 'rgb(var(--pe-grey-100))' }}>
            Camera Capture
          </h1>
          <p className="pe-body mt-2" style={{ color: 'rgb(var(--pe-grey-70))' }}>
            Capture from your device camera and upload a sanitized image.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium"
            style={{ background: 'rgb(var(--pe-blue-10))', color: 'rgb(var(--pe-blue-100))' }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            {verifiedEmployee.displayName}
          </span>
          <button
            type="button"
            onClick={() => {
              setVerifiedEmployee(null);
              resetCapture();
            }}
            className="pe-btn text-xs text-[rgb(var(--pe-grey-60))] hover:text-[rgb(var(--pe-grey-90))] underline"
          >
            Switch user
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-[rgb(var(--pe-grey-20))] bg-[rgb(var(--pe-ice))] p-3">
          <div ref={containerRef} className="relative w-full">
            <video
              ref={videoRef}
              className="h-auto w-full rounded-md bg-black"
              muted
              playsInline
              aria-label="Live camera preview"
            />
            {state === 'capturing' && (
              <canvas
                ref={overlayRef}
                className="pointer-events-none absolute inset-0 h-full w-full rounded-md"
                aria-hidden="true"
              />
            )}
          </div>
        </div>

        <div className="rounded-lg border border-[rgb(var(--pe-grey-20))] bg-[rgb(var(--pe-ice))] p-3">
          {captureImageUrl ? (
            <Image
              src={captureImageUrl}
              alt="Sanitized uploaded capture"
              width={640}
              height={360}
              className="h-auto w-full rounded-md"
            />
          ) : previewDataUrl ? (
            <Image
              src={previewDataUrl}
              alt="Captured image preview"
              width={640}
              height={360}
              className="h-auto w-full rounded-md"
              unoptimized
            />
          ) : (
            <div className="flex min-h-56 items-center justify-center rounded-md border border-dashed border-[rgb(var(--pe-grey-20))] px-4 text-center">
              <p className="pe-body" style={{ color: 'rgb(var(--pe-grey-60))' }}>
                Captured image preview appears here.
              </p>
            </div>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={startCamera}
          disabled={state === 'capturing' || state === 'uploading'}
          className="pe-btn rounded-md border border-[rgb(var(--pe-blue-100))] bg-[rgb(var(--pe-blue-100))] px-4 py-2 text-[rgb(var(--pe-grey-5))] transition-colors hover:bg-[rgb(var(--pe-blue-80))] disabled:cursor-not-allowed disabled:border-[rgb(var(--pe-grey-20))] disabled:bg-[rgb(var(--pe-grey-20))] disabled:text-[rgb(var(--pe-grey-60))] disabled:hover:bg-[rgb(var(--pe-grey-20))]"
        >
          Start Camera
        </button>

        <button
          type="button"
          onClick={captureAndUpload}
          disabled={state !== 'capturing'}
          className="pe-btn rounded-md border border-[rgb(var(--pe-blue-100))] bg-transparent px-4 py-2 text-[rgb(var(--pe-blue-100))] transition-colors hover:bg-[rgb(var(--pe-blue-10))] disabled:cursor-not-allowed disabled:border-[rgb(var(--pe-grey-20))] disabled:text-[rgb(var(--pe-grey-60))] disabled:hover:bg-transparent"
        >
          Capture & Upload
        </button>

        <button
          type="button"
          onClick={resetCapture}
          className="pe-btn rounded-md border border-[rgb(var(--pe-grey-20))] px-4 py-2 text-[rgb(var(--pe-grey-80))] hover:bg-[rgb(var(--pe-ice))]"
        >
          Reset
        </button>
      </div>

      <div
        className={`mt-4 rounded-md px-3 py-2 pe-body ${
          state === 'error'
            ? 'bg-[rgb(var(--pe-red-10))] text-[rgb(var(--pe-red-100))]'
            : state === 'success'
              ? 'bg-[rgb(var(--pe-green-10))] text-[rgb(var(--pe-green-100))]'
              : 'bg-[rgb(var(--pe-ice))] text-[rgb(var(--pe-grey-70))]'
        }`}
        role="status"
      >
        {statusText}
      </div>

      <section className="mt-6">
        <h2 className="pe-h5" style={{ color: 'rgb(var(--pe-grey-100))' }}>
          Recognition Result
        </h2>

        {recognitionLoading ? (
          <p className="pe-body mt-2" style={{ color: 'rgb(var(--pe-grey-70))' }}>
            Running recognition...
          </p>
        ) : !recognitionResult ? (
          <p className="pe-body mt-2" style={{ color: 'rgb(var(--pe-grey-70))' }}>
            Capture and upload an image to run recognition.
          </p>
        ) : (
          (() => {
            const faceMatched = recognitionResult.matched && !!recognitionResult.match;
            const facePerson = recognitionResult.match?.userId ?? null;
            const pinPerson = verifiedEmployee?.employeeId ?? null;
            const isCorrectMatch = faceMatched && facePerson === pinPerson;
            const isIdentityConflict = faceMatched && facePerson !== pinPerson;

            if (isCorrectMatch) {
              return (
                <div className="mt-3 rounded-md border border-[rgb(var(--pe-green-100))] bg-[rgb(var(--pe-green-10))] px-3 py-3">
                  <p
                    className="pe-body font-semibold"
                    style={{ color: 'rgb(var(--pe-green-100))' }}
                  >
                    ✅ Identity Confirmed — {recognitionResult.match!.displayName}
                  </p>
                  <p className="pe-small mt-1" style={{ color: 'rgb(var(--pe-grey-70))' }}>
                    PIN and face both match the same employee. Confidence:{' '}
                    {Math.round((recognitionResult.confidence ?? 0) * 100)}% | Candidates evaluated:{' '}
                    {recognitionResult.candidatesEvaluated}
                  </p>
                </div>
              );
            }

            if (isIdentityConflict) {
              return (
                <div className="mt-3 rounded-md border border-[rgb(var(--pe-red-100))] bg-[rgb(var(--pe-red-10))] px-3 py-3">
                  <p className="pe-body font-semibold" style={{ color: 'rgb(var(--pe-red-100))' }}>
                    ⚠️ Identity Conflict
                  </p>
                  <p className="pe-small mt-1" style={{ color: 'rgb(var(--pe-grey-70))' }}>
                    PIN verified as <strong>{verifiedEmployee?.displayName}</strong> but face
                    matches <strong>{recognitionResult.match!.displayName}</strong>. Confidence:{' '}
                    {Math.round((recognitionResult.confidence ?? 0) * 100)}%
                  </p>
                </div>
              );
            }

            if (recognitionResult.status === 'not_enrolled') {
              return (
                <div className="mt-3 rounded-md border border-[rgb(var(--pe-yellow-100))] bg-[rgb(var(--pe-yellow-10))] px-3 py-3">
                  <p className="pe-body" style={{ color: 'rgb(var(--pe-yellow-100))' }}>
                    PIN verified as <strong>{verifiedEmployee?.displayName}</strong>, but no face
                    photos are enrolled.
                  </p>
                  <p className="pe-small mt-1" style={{ color: 'rgb(var(--pe-grey-70))' }}>
                    Ask an administrator to add face photos to this employee&apos;s profile before
                    face recognition can be used.
                  </p>
                </div>
              );
            }

            if (recognitionResult.status === 'insufficient_data') {
              return (
                <div className="mt-3 rounded-md border border-[rgb(var(--pe-yellow-100))] bg-[rgb(var(--pe-yellow-10))] px-3 py-3">
                  <p className="pe-body" style={{ color: 'rgb(var(--pe-yellow-100))' }}>
                    PIN verified as <strong>{verifiedEmployee?.displayName}</strong>, but the face
                    scan didn&apos;t match their enrolled photos.
                  </p>
                  <p className="pe-small mt-1" style={{ color: 'rgb(var(--pe-grey-70))' }}>
                    The photo may be unclear or low quality. Try retaking in better lighting, or
                    update the employee&apos;s enrolled photos if their appearance has changed.
                  </p>
                </div>
              );
            }

            if (recognitionResult.status === 'indexing_in_progress') {
              return (
                <div className="mt-3 rounded-md border border-[rgb(var(--pe-blue-100))] bg-[rgb(var(--pe-blue-10))] px-3 py-3">
                  <p className="pe-body" style={{ color: 'rgb(var(--pe-blue-100))' }}>
                    PIN verified as <strong>{verifiedEmployee?.displayName}</strong>, but face
                    indexing is still in progress.
                  </p>
                  <p className="pe-small mt-1" style={{ color: 'rgb(var(--pe-grey-70))' }}>
                    Recognition will improve after pending embedding jobs are processed.
                  </p>
                </div>
              );
            }

            if (recognitionResult.status === 'not_indexed') {
              return (
                <div className="mt-3 rounded-md border border-[rgb(var(--pe-red-100))] bg-[rgb(var(--pe-red-10))] px-3 py-3">
                  <p className="pe-body" style={{ color: 'rgb(var(--pe-red-100))' }}>
                    PIN verified as <strong>{verifiedEmployee?.displayName}</strong>, but enrolled
                    photos are not indexed for recognition yet.
                  </p>
                  <p className="pe-small mt-1" style={{ color: 'rgb(var(--pe-grey-70))' }}>
                    Indexing must complete before face matching is available.
                  </p>
                </div>
              );
            }

            // There is deliberately no `if` block for a 'service_unavailable'
            // status: when the face embedding service is down
            // /api/camera/recognize returns HTTP 503 with the error code
            // EMBEDDING_SERVICE_UNAVAILABLE, which runRecognition's `catch`
            // handles, so no recognitionResult is ever set in that case.

            return (
              <div className="mt-3 rounded-md border border-[rgb(var(--pe-yellow-100))] bg-[rgb(var(--pe-yellow-10))] px-3 py-3">
                <p className="pe-body" style={{ color: 'rgb(var(--pe-yellow-100))' }}>
                  ❌ No confident face match found.
                </p>
                <p className="pe-small mt-1" style={{ color: 'rgb(var(--pe-grey-70))' }}>
                  PIN verified as <strong>{verifiedEmployee?.displayName}</strong>.
                  {recognitionResult.topCandidate
                    ? ` Closest face: ${recognitionResult.topCandidate.displayName} (${Math.round((recognitionResult.topCandidate.confidence ?? 0) * 100)}%)`
                    : ''}
                </p>
                <p className="pe-small mt-1" style={{ color: 'rgb(var(--pe-grey-70))' }}>
                  Candidates evaluated: {recognitionResult.candidatesEvaluated}
                </p>
              </div>
            );
          })()
        )}
      </section>
    </div>
  );
}

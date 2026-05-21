'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

type UploadState = 'idle' | 'capturing' | 'uploading' | 'success' | 'error';

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

type CaptureListItem = {
  id: string;
  imageUrl: string;
  createdAt: string;
};

type CaptureListResponse = {
  success: boolean;
  data?: {
    captures: CaptureListItem[];
    hasMore: boolean;
    nextCursor: string | null;
  };
  error?: {
    code: string;
    message: string;
  };
};

type EmployeeLookupItem = {
  id: string;
  firstName: string;
  name: string;
  email: string | null;
};

type EmployeeLookupResponse = {
  success: boolean;
  data?: {
    employees: EmployeeLookupItem[];
  };
  error?: {
    code: string;
    message: string;
  };
};

type EnrollmentResponse = {
  success: boolean;
  data?: {
    id: string;
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
    status: 'matched' | 'no_match' | 'insufficient_data';
    confidence: number | null;
    distance: number | null;
    candidatesEvaluated: number;
    thresholds: {
      minCandidates: number;
      minConfidence: number;
    };
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

export default function CameraCapturePanel() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [state, setState] = useState<UploadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [captureImageUrl, setCaptureImageUrl] = useState<string | null>(null);
  const [latestCaptureId, setLatestCaptureId] = useState<string | null>(null);
  const [recentCaptures, setRecentCaptures] = useState<CaptureListItem[]>([]);
  const [capturesLoading, setCapturesLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreCaptures, setHasMoreCaptures] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [recognitionLoading, setRecognitionLoading] = useState(false);
  const [recognitionResult, setRecognitionResult] = useState<RecognitionResponse['data'] | null>(
    null,
  );
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [employeeResults, setEmployeeResults] = useState<EmployeeLookupItem[]>([]);
  const [employeeLookupLoading, setEmployeeLookupLoading] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [enrollMessage, setEnrollMessage] = useState<string | null>(null);

  const { enabled: cameraEnabled, loading: cameraFlagLoading } = useFeatureFlag(
    'CAMERA_CAPTURE_ENABLED',
    true,
  );

  const loadRecentCaptures = useCallback(async () => {
    setCapturesLoading(true);
    try {
      const response = await fetch('/api/camera/captures?limit=8');
      const payload = (await response.json()) as CaptureListResponse;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error?.message ?? 'Unable to load recent captures');
      }
      setRecentCaptures(payload.data.captures);
      setHasMoreCaptures(payload.data.hasMore);
      setNextCursor(payload.data.nextCursor);
    } catch {
      setRecentCaptures([]);
      setHasMoreCaptures(false);
      setNextCursor(null);
    } finally {
      setCapturesLoading(false);
    }
  }, []);

  const loadMoreCaptures = useCallback(async () => {
    if (!nextCursor || loadingMore) return;

    setLoadingMore(true);
    try {
      const response = await fetch(
        `/api/camera/captures?limit=8&cursor=${encodeURIComponent(nextCursor)}`,
      );
      const payload = (await response.json()) as CaptureListResponse;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error?.message ?? 'Unable to load more captures');
      }
      const data = payload.data;

      setRecentCaptures((prev) => [...prev, ...data.captures]);
      setHasMoreCaptures(data.hasMore);
      setNextCursor(data.nextCursor);
    } catch {
      setHasMoreCaptures(false);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor]);

  const runRecognition = useCallback(async (imageBlob: Blob, excludeCaptureId?: string) => {
    setRecognitionLoading(true);
    try {
      const formData = new FormData();
      const file = new File([imageBlob], 'recognize.jpg', { type: 'image/jpeg' });
      formData.append('image', file);
      if (excludeCaptureId) {
        formData.append('excludeCaptureId', excludeCaptureId);
      }

      const response = await fetch('/api/camera/recognize', {
        method: 'POST',
        body: formData,
      });
      const payload = (await response.json()) as RecognitionResponse;

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error?.message ?? 'Recognition failed');
      }

      setRecognitionResult(payload.data);
    } catch (error) {
      setRecognitionResult(null);
      setErrorMessage(error instanceof Error ? error.message : 'Recognition failed');
    } finally {
      setRecognitionLoading(false);
    }
  }, []);

  const searchEmployees = useCallback(async (query: string) => {
    setEmployeeLookupLoading(true);
    try {
      const url = `/api/feature-a/employees?limit=20&q=${encodeURIComponent(query)}`;
      const response = await fetch(url);
      const payload = (await response.json()) as EmployeeLookupResponse;

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error?.message ?? 'Unable to search employees');
      }

      setEmployeeResults(payload.data.employees);
    } catch (error) {
      setEmployeeResults([]);
      setEnrollMessage(error instanceof Error ? error.message : 'Unable to search employees');
    } finally {
      setEmployeeLookupLoading(false);
    }
  }, []);

  const enrollLatestCapture = useCallback(async () => {
    if (!latestCaptureId || !selectedEmployeeId) {
      return;
    }

    setEnrollLoading(true);
    setEnrollMessage(null);
    try {
      const response = await fetch('/api/feature-a/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          captureId: latestCaptureId,
        }),
      });
      const payload = (await response.json()) as EnrollmentResponse;

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error?.message ?? 'Unable to assign capture to employee');
      }

      const selectedEmployee = employeeResults.find(
        (employee) => employee.id === selectedEmployeeId,
      );
      const employeeLabel = selectedEmployee ? selectedEmployee.name : 'employee';
      setEnrollMessage(`Capture assigned to ${employeeLabel}.`);
    } catch (error) {
      setEnrollMessage(
        error instanceof Error ? error.message : 'Unable to assign capture to employee',
      );
    } finally {
      setEnrollLoading(false);
    }
  }, [employeeResults, latestCaptureId, selectedEmployeeId]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setErrorMessage(null);
    setState('capturing');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setState('error');
      setErrorMessage('Unable to access camera. Check browser permissions and try again.');
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
      setLatestCaptureId(payload.data.captureId);
      setEnrollMessage(null);
      setState('success');
      await loadRecentCaptures();
      await runRecognition(imageBlob, payload.data.captureId);
    } catch (error) {
      setState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Upload failed');
    }
  }, [loadRecentCaptures, runRecognition, stopStream]);

  const resetCapture = useCallback(() => {
    setCaptureImageUrl(null);
    setPreviewDataUrl(null);
    setState('idle');
    setErrorMessage(null);
    setRecognitionResult(null);
    setLatestCaptureId(null);
    setSelectedEmployeeId('');
    setEnrollMessage(null);
  }, []);

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  useEffect(() => {
    if (!cameraFlagLoading && cameraEnabled) {
      loadRecentCaptures();
    }
  }, [cameraEnabled, cameraFlagLoading, loadRecentCaptures]);

  useEffect(() => {
    if (!cameraEnabled || cameraFlagLoading) {
      return;
    }

    const handle = setTimeout(() => {
      void searchEmployees(employeeQuery.trim());
    }, 250);

    return () => {
      clearTimeout(handle);
    };
  }, [cameraEnabled, cameraFlagLoading, employeeQuery, searchEmployees]);

  const statusText = useMemo(() => {
    if (state === 'uploading') return 'Uploading and sanitizing image...';
    if (state === 'success') return 'Image captured and stored successfully.';
    if (state === 'error') return errorMessage ?? 'Something went wrong.';
    if (state === 'capturing') return 'Camera is active. Capture when ready.';
    return 'Start camera to capture an image.';
  }, [errorMessage, state]);

  if (cameraFlagLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl rounded-xl border border-[rgb(var(--pe-grey-20))] bg-[rgb(var(--pe-primary))] p-6 shadow-sm">
        <p className="pe-body" style={{ color: 'rgb(var(--pe-grey-70))' }}>
          Loading camera feature...
        </p>
      </div>
    );
  }

  if (!cameraEnabled) {
    return (
      <div className="mx-auto w-full max-w-4xl rounded-xl border border-[rgb(var(--pe-grey-20))] bg-[rgb(var(--pe-primary))] p-6 shadow-sm">
        <h1 className="pe-h2" style={{ color: 'rgb(var(--pe-grey-100))' }}>
          Feature Unavailable
        </h1>
        <p className="pe-body mt-2" style={{ color: 'rgb(var(--pe-grey-70))' }}>
          Camera capture is currently disabled for your account.
        </p>
        <div className="mt-4">
          <Link
            href="/dashboard"
            className="pe-btn inline-flex items-center rounded-md border border-[rgb(var(--pe-grey-20))] px-3 py-1.5 text-[rgb(var(--pe-grey-80))] hover:bg-[rgb(var(--pe-ice))]"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl rounded-xl border border-[rgb(var(--pe-grey-20))] bg-[rgb(var(--pe-primary))] p-6 shadow-sm">
      <div className="mb-4">
        <Link
          href="/dashboard"
          className="pe-btn inline-flex items-center rounded-md border border-[rgb(var(--pe-grey-20))] px-3 py-1.5 text-[rgb(var(--pe-grey-80))] hover:bg-[rgb(var(--pe-ice))]"
        >
          Back to Dashboard
        </Link>
      </div>

      <h1 className="pe-h2" style={{ color: 'rgb(var(--pe-grey-100))' }}>
        Camera Capture
      </h1>
      <p className="pe-body mt-2" style={{ color: 'rgb(var(--pe-grey-70))' }}>
        Capture from your device camera and upload a sanitized image.
      </p>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-[rgb(var(--pe-grey-20))] bg-[rgb(var(--pe-ice))] p-3">
          <video
            ref={videoRef}
            className="h-auto w-full rounded-md bg-black"
            muted
            playsInline
            aria-label="Live camera preview"
          />
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
          Recent Captures
        </h2>
        {capturesLoading ? (
          <p className="pe-body mt-2" style={{ color: 'rgb(var(--pe-grey-70))' }}>
            Loading recent captures...
          </p>
        ) : recentCaptures.length === 0 ? (
          <p className="pe-body mt-2" style={{ color: 'rgb(var(--pe-grey-70))' }}>
            No captures yet.
          </p>
        ) : (
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {recentCaptures.map((capture) => (
                <article
                  key={capture.id}
                  className="overflow-hidden rounded-md border border-[rgb(var(--pe-grey-20))] bg-[rgb(var(--pe-ice))]"
                >
                  <Image
                    src={capture.imageUrl}
                    alt={`Capture ${capture.id}`}
                    width={320}
                    height={180}
                    className="h-32 w-full object-cover"
                  />
                  <div className="px-2 py-2">
                    <p className="pe-small" style={{ color: 'rgb(var(--pe-grey-70))' }}>
                      {new Date(capture.createdAt).toLocaleString()}
                    </p>
                  </div>
                </article>
              ))}
            </div>

            {hasMoreCaptures && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={loadMoreCaptures}
                  disabled={loadingMore}
                  className="pe-btn rounded-md border border-[rgb(var(--pe-grey-20))] px-4 py-2 text-[rgb(var(--pe-grey-80))] hover:bg-[rgb(var(--pe-ice))] disabled:cursor-not-allowed disabled:text-[rgb(var(--pe-grey-60))]"
                >
                  {loadingMore ? 'Loading...' : 'Load more captures'}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="mt-6">
        <h2 className="pe-h5" style={{ color: 'rgb(var(--pe-grey-100))' }}>
          Assign Capture To Employee
        </h2>

        <p className="pe-body mt-2" style={{ color: 'rgb(var(--pe-grey-70))' }}>
          Search employees, select one, then attach the latest captured photo.
        </p>

        <div className="mt-3 grid gap-3 md:grid-cols-[2fr_2fr_auto]">
          <input
            value={employeeQuery}
            onChange={(event) => setEmployeeQuery(event.target.value)}
            placeholder="Search by first name, full name, or email"
            className="pe-grid-input"
            aria-label="Search employees"
          />

          <select
            value={selectedEmployeeId}
            onChange={(event) => setSelectedEmployeeId(event.target.value)}
            className="pe-grid-input"
            aria-label="Select employee"
            disabled={employeeLookupLoading || employeeResults.length === 0}
          >
            <option value="">
              {employeeLookupLoading
                ? 'Searching employees...'
                : employeeResults.length === 0
                  ? 'No employees found'
                  : 'Select an employee'}
            </option>
            {employeeResults.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.firstName} - {employee.name}
                {employee.email ? ` (${employee.email})` : ''}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={enrollLatestCapture}
            disabled={!latestCaptureId || !selectedEmployeeId || enrollLoading}
            className="pe-btn rounded-md border border-[rgb(var(--pe-blue-100))] bg-[rgb(var(--pe-blue-100))] px-4 py-2 text-[rgb(var(--pe-grey-5))] transition-colors hover:bg-[rgb(var(--pe-blue-80))] disabled:cursor-not-allowed disabled:border-[rgb(var(--pe-grey-20))] disabled:bg-[rgb(var(--pe-grey-20))] disabled:text-[rgb(var(--pe-grey-60))]"
          >
            {enrollLoading ? 'Assigning...' : 'Assign Photo'}
          </button>
        </div>

        {!latestCaptureId ? (
          <p className="pe-small mt-2" style={{ color: 'rgb(var(--pe-grey-70))' }}>
            Capture and upload a photo first to enable assignment.
          </p>
        ) : (
          <p className="pe-small mt-2" style={{ color: 'rgb(var(--pe-grey-70))' }}>
            Latest capture ID: {latestCaptureId}
          </p>
        )}

        {enrollMessage ? (
          <div className="mt-3 rounded-md border border-[rgb(var(--pe-grey-20))] bg-[rgb(var(--pe-ice))] px-3 py-2 pe-small text-[rgb(var(--pe-grey-80))]">
            {enrollMessage}
          </div>
        ) : null}
      </section>

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
        ) : recognitionResult.matched && recognitionResult.match ? (
          <div className="mt-3 rounded-md border border-[rgb(var(--pe-green-100))] bg-[rgb(var(--pe-green-10))] px-3 py-3">
            <p className="pe-body" style={{ color: 'rgb(var(--pe-green-100))' }}>
              Match found: {recognitionResult.match.displayName}
            </p>
            <p className="pe-small mt-1" style={{ color: 'rgb(var(--pe-grey-70))' }}>
              Confidence: {Math.round((recognitionResult.confidence ?? 0) * 100)}% | Candidates
              evaluated: {recognitionResult.candidatesEvaluated}
            </p>
          </div>
        ) : recognitionResult.status === 'insufficient_data' ? (
          <div className="mt-3 rounded-md border border-[rgb(var(--pe-yellow-100))] bg-[rgb(var(--pe-yellow-10))] px-3 py-3">
            <p className="pe-body" style={{ color: 'rgb(var(--pe-yellow-100))' }}>
              Not enough reference data yet.
            </p>
            <p className="pe-small mt-1" style={{ color: 'rgb(var(--pe-grey-70))' }}>
              Add more captures before recognition becomes reliable. Minimum required:{' '}
              {recognitionResult.thresholds.minCandidates}; evaluated:{' '}
              {recognitionResult.candidatesEvaluated}
            </p>
          </div>
        ) : (
          <div className="mt-3 rounded-md border border-[rgb(var(--pe-yellow-100))] bg-[rgb(var(--pe-yellow-10))] px-3 py-3">
            <p className="pe-body" style={{ color: 'rgb(var(--pe-yellow-100))' }}>
              No confident match found.
            </p>
            <p className="pe-small mt-1" style={{ color: 'rgb(var(--pe-grey-70))' }}>
              Candidates evaluated: {recognitionResult.candidatesEvaluated}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

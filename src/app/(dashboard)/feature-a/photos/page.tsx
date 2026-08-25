'use client';

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

type Employee = {
  id: string;
  firstName: string;
  name: string;
  email: string | null;
  active: boolean;
  createdAt: string;
};

type EmployeesResponse = {
  success: boolean;
  data?: {
    employees: Employee[];
  };
  error?: {
    code: string;
    message: string;
  };
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

type LinkedPhoto = {
  id: string;
  captureId: string;
  imageUrl: string;
  createdAt: string;
};

type LinkedPhotosResponse = {
  success: boolean;
  data?: { photos: LinkedPhoto[] };
  error?: { code: string; message: string };
};

type EnrollPhotoResponse = {
  success: boolean;
  data?: {
    embeddingStatus?: 'pending' | 'failed';
  };
  error?: { code?: string; message: string };
};

function EmployeePhotoAccessPage() {
  const { enabled, loading } = useFeatureFlag('module:feature-a', true);
  const searchParams = useSearchParams();
  const preferredEmployeeId = searchParams.get('employeeId') ?? '';

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(preferredEmployeeId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [latestImageUrl, setLatestImageUrl] = useState<string | null>(null);
  const [linkedPhotos, setLinkedPhotos] = useState<LinkedPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const cameraContainerRef = useRef<HTMLDivElement | null>(null);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId],
  );

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  const loadEmployees = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch('/api/feature-a/employees?limit=200');
      const payload = (await response.json()) as EmployeesResponse;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error?.message ?? 'Unable to load employees');
      }

      setEmployees(payload.data.employees);

      if (!selectedEmployeeId && payload.data.employees[0]) {
        setSelectedEmployeeId(payload.data.employees[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load employees');
    }
  }, [selectedEmployeeId]);

  const loadLinkedPhotos = useCallback(async (employeeId: string) => {
    if (!employeeId) return;
    setLoadingPhotos(true);
    try {
      const response = await fetch(`/api/feature-a/employees/${employeeId}/photos`);
      const payload = (await response.json()) as LinkedPhotosResponse;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error?.message ?? 'Unable to load photos');
      }
      setLinkedPhotos(payload.data.photos);
    } catch {
      setLinkedPhotos([]);
    } finally {
      setLoadingPhotos(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && enabled) {
      void loadEmployees();
    }
  }, [enabled, loading, loadEmployees]);

  useEffect(() => {
    if (selectedEmployeeId) {
      void loadLinkedPhotos(selectedEmployeeId);
      setLatestImageUrl(null);
    }
  }, [selectedEmployeeId, loadLinkedPhotos]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // ── Face-guide overlay ────────────────────────────────────────────
  useEffect(() => {
    if (!cameraActive) return;

    const canvas = overlayRef.current;
    const container = cameraContainerRef.current;
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
  }, [cameraActive]);

  async function enrollCapture(captureId: string): Promise<'pending' | 'failed'> {
    if (!selectedEmployeeId) {
      throw new Error('Select an employee before uploading photos');
    }

    const response = await fetch(`/api/feature-a/employees/${selectedEmployeeId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ captureId }),
    });

    const payload = (await response.json()) as EnrollPhotoResponse;

    if (!response.ok || !payload.success) {
      if (payload.error?.code === 'NO_FACE_DETECTED') {
        throw new Error(
          'Photo not linked. Please take a photo with a clear human face and try again.',
        );
      }
      throw new Error(payload.error?.message ?? 'Unable to link photo to employee');
    }

    return payload.data?.embeddingStatus ?? 'pending';
  }

  async function uploadBlob(blob: Blob) {
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      const file = new File([blob], `employee-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      formData.append('image', file);
      formData.append('source', 'employee_database');

      const response = await fetch('/api/camera/upload', {
        method: 'POST',
        body: formData,
      });

      const payload = (await response.json()) as UploadResponse;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error?.message ?? 'Unable to upload photo');
      }

      const embeddingStatus = await enrollCapture(payload.data.captureId);
      setLatestImageUrl(payload.data.imageUrl);
      await loadLinkedPhotos(selectedEmployeeId);

      const employeeName = selectedEmployee?.name ?? 'employee';
      if (embeddingStatus === 'pending') {
        setSuccess(`Photo uploaded and linked to ${employeeName}. Indexing is now in progress.`);
      } else {
        setSuccess(
          `Photo uploaded and linked to ${employeeName}, but indexing is currently unavailable.`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload photo');
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto(photoId: string) {
    if (!selectedEmployeeId) return;
    setRemovingId(photoId);
    setError(null);
    try {
      const response = await fetch(
        `/api/feature-a/employees/${selectedEmployeeId}/photos/${photoId}`,
        { method: 'DELETE' },
      );
      const payload = (await response.json()) as { success: boolean; error?: { message: string } };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error?.message ?? 'Unable to remove photo');
      }
      await loadLinkedPhotos(selectedEmployeeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove photo');
    } finally {
      setRemovingId(null);
    }
  }

  async function onFileSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fileInput = e.currentTarget.elements.namedItem(
      'employeePhoto',
    ) as HTMLInputElement | null;
    const file = fileInput?.files?.[0];

    if (!file) {
      setError('Select a photo file first');
      return;
    }

    await uploadBlob(file);

    if (fileInput) {
      fileInput.value = '';
    }
  }

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
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
      setCameraActive(true);
    } catch {
      setError('Unable to access onboard camera. Check browser permissions and try again.');
    }
  }

  async function captureFromCamera() {
    if (!videoRef.current || !canvasRef.current) {
      setError('Camera preview is not ready yet');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('Unable to capture image from camera');
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setPreviewDataUrl(dataUrl);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), 'image/jpeg', 0.92);
    });

    if (!blob) {
      setError('Unable to read captured image');
      return;
    }

    await uploadBlob(blob);
  }

  if (loading) {
    return (
      <div className="pe-surface p-6">
        <p className="pe-body" style={{ color: 'rgb(var(--pe-grey-70))' }}>
          Loading employee photo access...
        </p>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="pe-surface p-6">
        <h1 className="pe-h2" style={{ color: 'rgb(var(--pe-grey-100))' }}>
          Employee Photo Access Unavailable
        </h1>
        <p className="pe-body mt-2" style={{ color: 'rgb(var(--pe-grey-70))' }}>
          The Employee Database module is disabled for your tenant.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="pe-h2" style={{ color: 'rgb(var(--pe-grey-100))' }}>
            Employee Photo Access
          </h1>
          <p className="pe-body mt-2" style={{ color: 'rgb(var(--pe-grey-70))' }}>
            Add photos to employee profiles from file upload or onboard camera capture.
          </p>
        </div>
        <Link
          href={{ pathname: '/feature-a' }}
          className="pe-btn rounded-md border border-[rgb(var(--pe-grey-20))] px-4 py-2 text-[rgb(var(--pe-grey-80))] hover:bg-[rgb(var(--pe-ice))]"
        >
          Back to Employee Library
        </Link>
      </div>

      {error && (
        <div className="rounded-md border border-[rgb(var(--pe-red-100))] bg-[rgb(var(--pe-red-10))] px-3 py-2">
          <p className="pe-body" style={{ color: 'rgb(var(--pe-red-100))' }}>
            {error}
          </p>
        </div>
      )}

      {success && (
        <div className="rounded-md border border-[rgb(var(--pe-green-100))] bg-[rgb(var(--pe-green-10))] px-3 py-2">
          <p className="pe-body" style={{ color: 'rgb(var(--pe-green-100))' }}>
            {success}
          </p>
        </div>
      )}

      <section className="pe-surface p-4">
        <label className="pe-small block font-semibold" style={{ color: 'rgb(var(--pe-grey-70))' }}>
          Choose Employee
        </label>
        <select
          value={selectedEmployeeId}
          onChange={(e) => setSelectedEmployeeId(e.target.value)}
          className="pe-grid-select mt-2 w-full md:max-w-md"
        >
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name} {employee.email ? `(${employee.email})` : ''}
            </option>
          ))}
        </select>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <form className="pe-surface p-4" onSubmit={onFileSubmit}>
          <h2 className="pe-h5" style={{ color: 'rgb(var(--pe-grey-100))' }}>
            Upload from File
          </h2>
          <p className="pe-small mt-2" style={{ color: 'rgb(var(--pe-grey-70))' }}>
            Supported formats: JPG, PNG, WEBP (max 5MB).
          </p>

          <input
            name="employeePhoto"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="mt-3 block w-full text-sm"
          />

          <button
            type="submit"
            disabled={busy || !selectedEmployeeId}
            className="pe-btn mt-4 rounded-md border border-[rgb(var(--pe-blue-100))] bg-[rgb(var(--pe-blue-100))] px-4 py-2 text-[rgb(var(--pe-grey-5))] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {busy ? 'Uploading...' : 'Upload and Link Photo'}
          </button>
        </form>

        <div className="pe-surface p-4">
          <h2 className="pe-h5" style={{ color: 'rgb(var(--pe-grey-100))' }}>
            Capture with Onboard Camera
          </h2>
          <p className="pe-small mt-2" style={{ color: 'rgb(var(--pe-grey-70))' }}>
            Use your device camera, then capture and link the photo to the selected employee.
          </p>

          <div className="mt-3 rounded-md border border-[rgb(var(--pe-grey-20))] bg-black/90 p-2">
            <div ref={cameraContainerRef} className="relative w-full">
              <video ref={videoRef} className="h-auto w-full rounded-md" muted playsInline />
              {cameraActive && (
                <canvas
                  ref={overlayRef}
                  className="pointer-events-none absolute inset-0 h-full w-full rounded-md"
                  aria-hidden="true"
                />
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={startCamera}
              disabled={cameraActive || busy}
              className="pe-btn rounded-md border border-[rgb(var(--pe-blue-100))] bg-[rgb(var(--pe-blue-100))] px-4 py-2 text-[rgb(var(--pe-grey-5))] disabled:opacity-60"
            >
              Start Camera
            </button>
            <button
              type="button"
              onClick={captureFromCamera}
              disabled={!cameraActive || busy || !selectedEmployeeId}
              className="pe-btn rounded-md border border-[rgb(var(--pe-blue-100))] bg-transparent px-4 py-2 text-[rgb(var(--pe-blue-100))] disabled:opacity-60"
            >
              Capture and Upload
            </button>
            <button
              type="button"
              onClick={stopCamera}
              disabled={!cameraActive || busy}
              className="pe-btn rounded-md border border-[rgb(var(--pe-grey-20))] px-4 py-2 text-[rgb(var(--pe-grey-80))] disabled:opacity-60"
            >
              Stop Camera
            </button>
          </div>
        </div>
      </section>

      <canvas ref={canvasRef} className="hidden" />

      {previewDataUrl && (
        <section className="pe-surface p-4">
          <h2 className="pe-h5" style={{ color: 'rgb(var(--pe-grey-100))' }}>
            Captured Preview
          </h2>
          <div className="mt-3 max-w-sm">
            <Image
              src={previewDataUrl}
              alt="Captured preview"
              width={480}
              height={300}
              className="h-auto w-full rounded-md border border-[rgb(var(--pe-grey-20))]"
              unoptimized
            />
          </div>
        </section>
      )}

      <section className="pe-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="pe-h5" style={{ color: 'rgb(var(--pe-grey-100))' }}>
            Linked Photos
            {linkedPhotos.length > 0 && (
              <span
                className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                style={{
                  background: 'rgb(var(--pe-blue-10))',
                  color: 'rgb(var(--pe-blue-100))',
                }}
              >
                {linkedPhotos.length}
              </span>
            )}
          </h2>
          {loadingPhotos && (
            <p className="pe-small" style={{ color: 'rgb(var(--pe-grey-60))' }}>
              Loading...
            </p>
          )}
        </div>

        {!loadingPhotos && linkedPhotos.length === 0 && (
          <p className="pe-body mt-2" style={{ color: 'rgb(var(--pe-grey-70))' }}>
            No photos linked to this employee yet.
          </p>
        )}

        {linkedPhotos.length > 0 && (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {linkedPhotos.map((photo) => (
              <div
                key={photo.id}
                className="group relative overflow-hidden rounded-md border border-[rgb(var(--pe-grey-20))]"
              >
                <Image
                  src={photo.imageUrl}
                  alt="Linked employee photo"
                  width={320}
                  height={200}
                  className="h-40 w-full object-cover"
                />
                <div
                  className="flex items-center justify-between gap-2 px-2 py-1.5"
                  style={{ background: 'rgb(var(--pe-grey-5))' }}
                >
                  <p className="pe-small truncate" style={{ color: 'rgb(var(--pe-grey-60))' }}>
                    {new Date(photo.createdAt).toLocaleDateString()}
                  </p>
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.id)}
                    disabled={removingId === photo.id}
                    className="pe-btn shrink-0 rounded border border-[rgb(var(--pe-red-100))] px-2 py-0.5 text-xs text-[rgb(var(--pe-red-100))] hover:bg-[rgb(var(--pe-red-10))] disabled:opacity-60"
                  >
                    {removingId === photo.id ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function EmployeePhotoAccessPageWrapper() {
  return (
    <Suspense>
      <EmployeePhotoAccessPage />
    </Suspense>
  );
}

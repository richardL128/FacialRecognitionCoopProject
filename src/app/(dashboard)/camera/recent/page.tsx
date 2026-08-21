'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type RecognitionMeta = {
  status: string;
  confidence: number | null;
  recognizedAt: string | null;
  employee: { id: string; name: string } | null;
};

type Capture = {
  id: string;
  createdAt: string;
  imageUrl: string;
  recognition: RecognitionMeta | null;
};

type CapturesResponse = {
  success: boolean;
  data?: {
    captures: Capture[];
  };
  error?: {
    code: string;
    message: string;
  };
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function RecognitionBadge({ recognition }: { recognition: RecognitionMeta }) {
  const { status, confidence, employee } = recognition;

  if (status === 'matched' && employee) {
    return (
      <div className="rounded border border-[rgb(var(--pe-green-100))] bg-[rgb(var(--pe-green-10))] px-2 py-1.5">
        <p className="text-xs font-semibold" style={{ color: 'rgb(var(--pe-green-100))' }}>
          Matched: {employee.name}
        </p>
        {confidence !== null && (
          <p className="text-xs" style={{ color: 'rgb(var(--pe-grey-70))' }}>
            Confidence: {Math.round(confidence * 100)}%
          </p>
        )}
      </div>
    );
  }

  if (status === 'no_match') {
    return (
      <div className="rounded border border-[rgb(var(--pe-yellow-100))] bg-[rgb(var(--pe-yellow-10))] px-2 py-1.5">
        <p className="text-xs font-semibold" style={{ color: 'rgb(var(--pe-yellow-100))' }}>
          No match found
        </p>
        {confidence !== null && (
          <p className="text-xs" style={{ color: 'rgb(var(--pe-grey-70))' }}>
            Closest: {Math.round(confidence * 100)}%
          </p>
        )}
      </div>
    );
  }

  if (status === 'not_enrolled') {
    return (
      <div className="rounded border border-[rgb(var(--pe-grey-40))] bg-[rgb(var(--pe-grey-10))] px-2 py-1.5">
        <p className="text-xs font-semibold" style={{ color: 'rgb(var(--pe-grey-70))' }}>
          Not enrolled
        </p>
      </div>
    );
  }

  if (status === 'insufficient_data') {
    return (
      <div className="rounded border border-[rgb(var(--pe-yellow-100))] bg-[rgb(var(--pe-yellow-10))] px-2 py-1.5">
        <p className="text-xs font-semibold" style={{ color: 'rgb(var(--pe-yellow-100))' }}>
          Scan didn&apos;t match enrolled photos
        </p>
      </div>
    );
  }

  if (status === 'indexing_in_progress') {
    return (
      <div className="rounded border border-[rgb(var(--pe-blue-100))] bg-[rgb(var(--pe-blue-10))] px-2 py-1.5">
        <p className="text-xs font-semibold" style={{ color: 'rgb(var(--pe-blue-100))' }}>
          Indexing in progress
        </p>
      </div>
    );
  }

  if (status === 'not_indexed') {
    return (
      <div className="rounded border border-[rgb(var(--pe-red-100))] bg-[rgb(var(--pe-red-10))] px-2 py-1.5">
        <p className="text-xs font-semibold" style={{ color: 'rgb(var(--pe-red-100))' }}>
          Not indexed
        </p>
      </div>
    );
  }

  if (status === 'service_unavailable') {
    return (
      <div className="rounded border border-[rgb(var(--pe-red-100))] bg-[rgb(var(--pe-red-10))] px-2 py-1.5">
        <p className="text-xs font-semibold" style={{ color: 'rgb(var(--pe-red-100))' }}>
          Service unavailable
        </p>
      </div>
    );
  }

  return null;
}

export default function RecentCameraCapturesPage() {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCaptures = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/camera/captures?limit=10', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = (await response.json()) as CapturesResponse;

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error?.message ?? 'Unable to load recent captures');
      }

      setCaptures(payload.data.captures);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load recent captures');
      setCaptures([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCaptures();
  }, [loadCaptures]);

  const title = useMemo(() => {
    if (loading) {
      return 'Recent Camera Captures';
    }
    return `Recent Camera Captures (${captures.length})`;
  }, [captures.length, loading]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="pe-h2" style={{ color: 'rgb(var(--pe-grey-100))' }}>
            {title}
          </h1>
          <p className="pe-body mt-2" style={{ color: 'rgb(var(--pe-grey-70))' }}>
            Last 10 photos from the camera capture flow with capture timestamps.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadCaptures()}
          disabled={loading}
          className="pe-btn rounded-md border border-[rgb(var(--pe-blue-100))] bg-[rgb(var(--pe-primary))] px-3 py-2 text-sm font-medium text-[rgb(var(--pe-blue-100))] hover:bg-[rgb(var(--pe-blue-10))] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-[rgb(var(--pe-red-100))] bg-[rgb(var(--pe-red-10))] px-3 py-2">
          <p className="pe-body" style={{ color: 'rgb(var(--pe-red-100))' }}>
            {error}
          </p>
        </div>
      )}

      {loading && (
        <div className="pe-surface p-6">
          <p className="pe-body" style={{ color: 'rgb(var(--pe-grey-70))' }}>
            Loading recent captures...
          </p>
        </div>
      )}

      {!loading && !error && captures.length === 0 && (
        <div className="pe-surface p-6">
          <p className="pe-body" style={{ color: 'rgb(var(--pe-grey-70))' }}>
            No captures found yet.
          </p>
        </div>
      )}

      {!loading && captures.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {captures.map((capture) => (
            <article key={capture.id} className="pe-surface overflow-hidden">
              <img
                src={capture.imageUrl}
                alt="Recent camera capture"
                className="h-52 w-full bg-[rgb(var(--pe-grey-10))] object-cover"
                loading="lazy"
              />
              <div className="space-y-2 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--pe-grey-60))]">
                  Capture Metadata
                </p>
                <p className="pe-body text-sm" style={{ color: 'rgb(var(--pe-grey-90))' }}>
                  Taken: {formatDateTime(capture.createdAt)}
                </p>
                {capture.recognition?.recognizedAt && (
                  <p className="pe-body text-sm" style={{ color: 'rgb(var(--pe-grey-70))' }}>
                    Recognised: {formatDateTime(capture.recognition.recognizedAt)}
                  </p>
                )}
                {capture.recognition ? (
                  <RecognitionBadge recognition={capture.recognition} />
                ) : (
                  <p className="text-xs italic" style={{ color: 'rgb(var(--pe-grey-50))' }}>
                    Recognition not yet run
                  </p>
                )}
                <p className="font-mono text-xs text-[rgb(var(--pe-grey-60))]">ID: {capture.id}</p>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

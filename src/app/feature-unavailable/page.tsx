export default function FeatureUnavailablePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[rgb(var(--pe-ice))]">
      <div className="mx-auto max-w-md text-center">
        <div
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: 'rgb(var(--pe-orange-10))' }}
        >
          <svg
            className="h-8 w-8"
            style={{ color: 'rgb(var(--pe-orange-80))' }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h1 className="pe-h2 mb-2" style={{ color: 'rgb(var(--pe-grey-100))' }}>
          Feature Unavailable
        </h1>
        <p className="pe-body mb-6" style={{ color: 'rgb(var(--pe-grey-60))' }}>
          This feature is temporarily unavailable. Please try again later or contact support if the
          issue persists.
        </p>
        <a
          href="/dashboard"
          className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
          style={{ background: 'rgb(var(--pe-blue-80))' }}
        >
          Back to Dashboard
        </a>
      </div>
    </div>
  );
}

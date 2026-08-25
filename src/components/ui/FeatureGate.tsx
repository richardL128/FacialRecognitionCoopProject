'use client';

import { useFeatureFlag } from '@/hooks/useFeatureFlag';

type FeatureGateProps = {
  /** The flag key to check */
  flagKey: string;
  /** Content to show when the feature is enabled */
  children: React.ReactNode;
  /** Optional content to show while loading (default: null = render nothing) */
  loading?: React.ReactNode;
  /** Optional content when the feature is disabled (default: standard message) */
  fallback?: React.ReactNode;
};

const DEFAULT_FALLBACK = (
  <div className="flex h-64 items-center justify-center">
    <div className="text-center">
      <p className="pe-h3 mb-2" style={{ color: 'rgb(var(--pe-grey-100))' }}>
        Feature Not Available
      </p>
      <p className="pe-body" style={{ color: 'rgb(var(--pe-grey-60))' }}>
        This feature is not enabled for your account. Contact your administrator for access.
      </p>
    </div>
  </div>
);

/**
 * Conditionally renders children based on a feature flag.
 *
 * Usage:
 *   <FeatureGate flagKey="module:feature-a">
 *     <FeatureContent />
 *   </FeatureGate>
 */
export default function FeatureGate({
  flagKey,
  children,
  loading = null,
  fallback = DEFAULT_FALLBACK,
}: FeatureGateProps) {
  const { enabled, loading: isLoading } = useFeatureFlag(flagKey);

  if (isLoading) return <>{loading}</>;
  if (!enabled) return <>{fallback}</>;
  return <>{children}</>;
}

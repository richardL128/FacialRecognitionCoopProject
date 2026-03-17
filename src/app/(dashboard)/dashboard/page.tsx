'use client';

import DashboardTileLayout from '@/components/dashboard/DashboardTileLayout';
import { useDashboardLayout } from '@/hooks/useDashboardLayout';

// TODO: Replace with real role from session once identity provider is integrated
const PLACEHOLDER_ROLE = 'ADMIN';

export default function DashboardPage() {
  const { tiles, isLoading, updateLayout, resetLayout } = useDashboardLayout({
    role: PLACEHOLDER_ROLE,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="pe-body" style={{ color: 'rgb(var(--pe-grey-60))' }}>Loading dashboard…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="pe-h2" style={{ color: 'rgb(var(--pe-grey-100))' }}>Dashboard</h1>
        <button
          onClick={resetLayout}
          className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          style={{
            border: '1px solid rgb(var(--pe-grey-20))',
            color: 'rgb(var(--pe-grey-70))',
          }}
        >
          Reset Layout
        </button>
      </div>
      <DashboardTileLayout tiles={tiles} onReposition={updateLayout} />
    </div>
  );
}

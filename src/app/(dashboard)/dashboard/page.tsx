'use client';

import { useMemo } from 'react';
import DashboardTileLayout from '@/components/dashboard/DashboardTileLayout';
import { useDashboardLayout } from '@/hooks/useDashboardLayout';
import type { TileConfig } from '@/constants/dashboardLayouts';

// TODO: Replace with real role from session once identity provider is integrated
const PLACEHOLDER_ROLE = 'ADMIN';

export default function DashboardPage() {
  const { tiles, isLoading } = useDashboardLayout({
    role: PLACEHOLDER_ROLE,
  });

  const activityOnlyTiles = useMemo<TileConfig[]>(() => {
    const existing = tiles.find((tile) => tile.tileType === 'recent-activity');
    return [
      {
        id: existing?.id ?? 'recent-activity',
        header: 'Recent Activity',
        col: 1,
        row: 1,
        colSpan: 3,
        rowSpan: 3,
        tileType: 'recent-activity',
      },
    ];
  }, [tiles]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="pe-body" style={{ color: 'rgb(var(--pe-grey-60))' }}>
          Loading dashboard…
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="pe-h2" style={{ color: 'rgb(var(--pe-grey-100))' }}>
          Dashboard
        </h1>
      </div>
      <DashboardTileLayout tiles={activityOnlyTiles} />
    </div>
  );
}

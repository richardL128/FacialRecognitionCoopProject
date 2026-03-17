'use client';

import { useState, useEffect, useCallback } from 'react';
import type { TileConfig, DashboardLayoutData } from '@/constants/dashboardLayouts';
import { getDefaultLayout } from '@/constants/dashboardLayouts';

interface UseDashboardLayoutOptions {
  role: string;
}

export function useDashboardLayout({ role }: UseDashboardLayoutOptions) {
  const [tiles, setTiles] = useState<DashboardLayoutData>(() => getDefaultLayout(role));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/dashboard/layout');
        if (res.ok) {
          const data: { layout: DashboardLayoutData | null } = await res.json();
          if (!cancelled && data.layout) {
            setTiles(data.layout);
          }
        }
      } catch {
        // Fall through to default layout
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [role]);

  const updateLayout = useCallback(async (updated: TileConfig[]) => {
    setTiles(updated);

    try {
      await fetch('/api/dashboard/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout: updated }),
      });
    } catch {
      // Optimistic update — layout is already set in state
    }
  }, []);

  const resetLayout = useCallback(() => {
    const defaults = getDefaultLayout(role);
    setTiles(defaults);
    fetch('/api/dashboard/layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout: defaults }),
    }).catch(() => {
      /* best-effort */
    });
  }, [role]);

  return { tiles, isLoading, updateLayout, resetLayout };
}

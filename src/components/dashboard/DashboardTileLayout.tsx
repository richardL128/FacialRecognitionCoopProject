'use client';

import { TileLayout, type TileLayoutRepositionEvent } from '@progress/kendo-react-layout';
import type { TileConfig, TileType } from '@/constants/dashboardLayouts';
import OverviewTile from './tiles/OverviewTile';
import RecentActivityTile from './tiles/RecentActivityTile';
import StatsTile from './tiles/StatsTile';
import QuickActionsTile from './tiles/QuickActionsTile';
import AlertsTile from './tiles/AlertsTile';
import PendingItemsTile from './tiles/PendingItemsTile';

const TILE_COMPONENTS: Record<TileType, React.ComponentType> = {
  overview: OverviewTile,
  'recent-activity': RecentActivityTile,
  stats: StatsTile,
  'quick-actions': QuickActionsTile,
  alerts: AlertsTile,
  'pending-items': PendingItemsTile,
};

interface DashboardTileLayoutProps {
  tiles: TileConfig[];
  onReposition: (tiles: TileConfig[]) => void;
}

export default function DashboardTileLayout({ tiles, onReposition }: DashboardTileLayoutProps) {
  const items = tiles.map((tile) => {
    const Component = TILE_COMPONENTS[tile.tileType];
    return {
      header: tile.header,
      body: <Component />,
      col: tile.col,
      row: tile.row,
      colSpan: tile.colSpan,
      rowSpan: tile.rowSpan,
    };
  });

  function handleReposition(e: TileLayoutRepositionEvent) {
    const updated = tiles.map((tile, i) => {
      const val = e.value[i];
      if (!val) return tile;
      return {
        ...tile,
        col: val.col ?? tile.col,
        row: val.row ?? tile.row,
        colSpan: val.colSpan ?? tile.colSpan,
        rowSpan: val.rowSpan ?? tile.rowSpan,
      };
    });
    onReposition(updated);
  }

  return (
    <TileLayout
      columns={3}
      rowHeight={180}
      gap={{ rows: 16, columns: 16 }}
      items={items}
      onReposition={handleReposition}
      autoFlow="row dense"
      className="dashboard-tiles"
    />
  );
}

import type { TileLayoutRepositionEvent } from '@progress/kendo-react-layout';

export interface TileConfig {
  id: string;
  header: string;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  /** Component key used to resolve which tile to render */
  tileType: TileType;
}

export type TileType =
  | 'overview'
  | 'recent-activity'
  | 'stats'
  | 'quick-actions'
  | 'alerts'
  | 'pending-items';

export type DashboardLayoutData = TileConfig[];

/** Reposition event data for persistence */
export type LayoutChangeData =
  Parameters<NonNullable<Parameters<typeof Number>[0]>> extends never ? TileConfig[] : TileConfig[];

// ─── Default layouts per role ──────────────────────────────────────────

const activityOnlyLayout: DashboardLayoutData = [
  {
    id: 'recent-activity',
    header: 'Recent Activity',
    col: 1,
    row: 1,
    colSpan: 3,
    rowSpan: 3,
    tileType: 'recent-activity',
  },
];

const ROLE_LAYOUTS: Record<string, DashboardLayoutData> = {
  PLATFORM_ADMIN: activityOnlyLayout,
  ADMIN: activityOnlyLayout,
  MANAGER: activityOnlyLayout,
  USER: activityOnlyLayout,
  VIEWER: activityOnlyLayout,
};

export function getDefaultLayout(role: string): DashboardLayoutData {
  return ROLE_LAYOUTS[role] ?? activityOnlyLayout;
}

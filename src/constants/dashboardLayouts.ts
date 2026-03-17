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
export type LayoutChangeData = Parameters<
  NonNullable<Parameters<typeof Number>[0]>
> extends never
  ? TileConfig[]
  : TileConfig[];

// ─── Default layouts per role ──────────────────────────────────────────

const adminLayout: DashboardLayoutData = [
  { id: 'overview', header: 'Overview', col: 1, row: 1, colSpan: 2, rowSpan: 2, tileType: 'overview' },
  { id: 'alerts', header: 'Alerts', col: 3, row: 1, colSpan: 1, rowSpan: 1, tileType: 'alerts' },
  { id: 'pending-items', header: 'Pending Items', col: 3, row: 2, colSpan: 1, rowSpan: 1, tileType: 'pending-items' },
  { id: 'stats', header: 'Stats', col: 1, row: 3, colSpan: 2, rowSpan: 1, tileType: 'stats' },
  { id: 'recent-activity', header: 'Recent Activity', col: 1, row: 4, colSpan: 2, rowSpan: 1, tileType: 'recent-activity' },
  { id: 'quick-actions', header: 'Quick Actions', col: 3, row: 3, colSpan: 1, rowSpan: 2, tileType: 'quick-actions' },
];

const managerLayout: DashboardLayoutData = [
  { id: 'overview', header: 'Overview', col: 1, row: 1, colSpan: 2, rowSpan: 1, tileType: 'overview' },
  { id: 'quick-actions', header: 'Quick Actions', col: 3, row: 1, colSpan: 1, rowSpan: 1, tileType: 'quick-actions' },
  { id: 'stats', header: 'Stats', col: 1, row: 2, colSpan: 2, rowSpan: 1, tileType: 'stats' },
  { id: 'recent-activity', header: 'Recent Activity', col: 1, row: 3, colSpan: 3, rowSpan: 1, tileType: 'recent-activity' },
];

const viewerLayout: DashboardLayoutData = [
  { id: 'overview', header: 'Overview', col: 1, row: 1, colSpan: 3, rowSpan: 1, tileType: 'overview' },
  { id: 'recent-activity', header: 'Recent Activity', col: 1, row: 2, colSpan: 3, rowSpan: 1, tileType: 'recent-activity' },
];

const ROLE_LAYOUTS: Record<string, DashboardLayoutData> = {
  PLATFORM_ADMIN: adminLayout,
  ADMIN: adminLayout,
  MANAGER: managerLayout,
  USER: managerLayout,
  VIEWER: viewerLayout,
};

export function getDefaultLayout(role: string): DashboardLayoutData {
  return ROLE_LAYOUTS[role] ?? managerLayout;
}

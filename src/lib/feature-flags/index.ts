/**
 * Public API for the feature flags module.
 * Consuming code should import from this file only.
 *
 * Usage in API routes (server-side):
 *   import { featureFlags } from '@/lib/feature-flags';
 *   const enabled = await featureFlags.isEnabled('module:feature-a', {
 *     tenantId: session.tenantId,
 *   });
 *
 * Usage for page-level gating:
 *   import { withPageGate } from '@/lib/feature-flags/withPageGate';
 *   export default withPageGate('module:feature-a')(FeaturePage);
 *
 * Usage in client components:
 *   const { enabled } = useFeatureFlag('module:feature-a');
 *   const { flags } = useFeatureFlags(['module:feature-a', 'CAMERA_CAPTURE_ENABLED']);
 */

export { isEnabled, clearCache, getCacheStats } from './service';
export { warmConnections, closeConnections } from './external';
export { withPageGate } from './withPageGate';
export type { PermissionContext } from './types';

import * as service from './service';
import { warmConnections, closeConnections } from './external';

/** Namespaced export for convenience */
export const featureFlags = {
  isEnabled: service.isEnabled,
  clearCache: service.clearCache,
  getCacheStats: service.getCacheStats,
  warmConnections,
  closeConnections,
} as const;

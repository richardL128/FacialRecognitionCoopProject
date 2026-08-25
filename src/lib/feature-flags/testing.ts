/**
 * Mock feature flags service for unit tests.
 * Replaces the real service with controllable in-memory data.
 *
 * Usage in tests:
 *   import { createMockFeatureFlags } from '@/lib/feature-flags/testing';
 *
 *   const mock = createMockFeatureFlags({
 *     'module:feature-a': true,
 *     'CAMERA_CAPTURE_ENABLED': true,
 *   });
 *
 *   // Override the real module in your test setup:
 *   jest.mock('@/lib/feature-flags', () => ({ featureFlags: mock }));
 */

import type { PermissionContext } from './types';

type MockFlags = Record<string, boolean>;

type MockFeatureFlagsOptions = {
  flags?: MockFlags;
};

export function createMockFeatureFlags(options: MockFeatureFlagsOptions = {}) {
  const { flags = {} } = options;
  let callLog: Array<{ method: string; args: unknown[] }> = [];

  return {
    async isEnabled(key: string, _ctx: PermissionContext): Promise<boolean> {
      callLog.push({ method: 'isEnabled', args: [key, _ctx] });
      return flags[key] ?? true; // Default to enabled like the real service
    },

    clearCache(): void {
      callLog.push({ method: 'clearCache', args: [] });
    },

    getCacheStats() {
      return { hits: 0, misses: 0, size: 0, hitRate: 'N/A' };
    },

    async warmConnections(): Promise<void> {
      callLog.push({ method: 'warmConnections', args: [] });
    },

    async closeConnections(): Promise<void> {
      callLog.push({ method: 'closeConnections', args: [] });
    },

    // Test utilities
    _getCallLog() {
      return callLog;
    },

    _reset() {
      callLog = [];
    },

    _setFlag(key: string, enabled: boolean) {
      flags[key] = enabled;
    },
  };
}

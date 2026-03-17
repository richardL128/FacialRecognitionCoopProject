/**
 * Package / subscription limit enforcement utilities.
 * Checks usage limits before allowing resource creation.
 *
 * Usage in API routes:
 *   import { enforceResourceLimit } from '@/lib/feature-flags/limits';
 *
 *   // Before creating a resource:
 *   await enforceResourceLimit(session.tenantId, 'users', currentCount, maxAllowed);
 *
 * TODO: Connect `maxAllowed` to your billing/subscription system to enforce
 * per-plan limits dynamically.
 */

import { AppError } from '@/lib/errors';

/**
 * Enforce a simple numeric limit on a resource type.
 * Throws AppError(403) if `currentCount >= maxAllowed`.
 *
 * @param tenantId    - The tenant being checked
 * @param resource    - Human-readable resource name for the error message
 * @param currentCount - How many records currently exist
 * @param maxAllowed  - The plan limit (or Infinity to skip enforcement)
 */
export function enforceResourceLimit(
  _tenantId: string,
  resource: string,
  currentCount: number,
  maxAllowed: number,
): void {
  if (!isFinite(maxAllowed)) return;
  if (currentCount >= maxAllowed) {
    throw AppError.forbidden(
      `${resource} limit reached for your plan (${currentCount}/${maxAllowed}). ` +
        `Please upgrade to add more.`,
    );
  }
}

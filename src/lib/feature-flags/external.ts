/**
 * External permissions adapter — placeholder.
 *
 * This file is where you connect an external permissions or feature flag system
 * (e.g. LaunchDarkly, Unleash, PostHog feature flags, or a custom SQL Server
 * stored-procedure system).
 *
 * The feature flag service in service.ts will call `externalIsEnabled()` as a
 * final fallback after checking Postgres overrides. If no external system is
 * configured, it defaults to enabled (fail-open).
 *
 * To implement:
 *   1. Add your connection/SDK initialisation here.
 *   2. Export `externalIsEnabled(key, tenantId)` returning Promise<boolean | null>
 *      (return null to fall through to the default).
 *   3. Optionally export `warmConnections()` and `closeConnections()` for lifecycle hooks.
 *
 * Example stub:
 *
 *   export async function externalIsEnabled(
 *     key: string,
 *     tenantId: string,
 *   ): Promise<boolean | null> {
 *     // Call your SQL Server stored proc, LaunchDarkly SDK, etc.
 *     return null; // null = no external opinion, fall through to default
 *   }
 */

export async function externalIsEnabled(
  _key: string,
  _tenantId: string,
): Promise<boolean | null> {
  // TODO: implement external permissions check
  return null; // Fail-open: no external system configured
}

export async function warmConnections(): Promise<void> {
  // TODO: pre-warm connection pools at startup
}

export async function closeConnections(): Promise<void> {
  // TODO: graceful shutdown of connection pools
}

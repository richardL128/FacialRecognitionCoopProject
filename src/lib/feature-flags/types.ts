/**
 * Feature flag types.
 *
 * The PermissionContext is used when evaluating feature flags.
 * It carries the identifiers needed to check GLOBAL, TENANT, and CLIENT-level
 * overrides stored in Postgres.
 *
 * To integrate an external permissions system (e.g. LaunchDarkly, Unleash,
 * or a custom SQL-based system), see mssql.ts for the adapter pattern.
 */

/** Context needed to evaluate feature flags */
export type PermissionContext = {
  tenantId: string;
  /** Optional client/group ID for CLIENT-scoped flag checks */
  clientId?: string;
};

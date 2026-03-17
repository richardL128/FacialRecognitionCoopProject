import type { Role } from '@/generated/prisma/client';
import type { SessionContext } from '@/lib/auth/session';
import { featureFlags } from '@/lib/feature-flags';

/**
 * Permission string format: [domain]:[resource]:[action]
 * Examples: 'platform:tenants:create', 'users:invite', 'settings:update'
 */
type Permission = `${string}:${string}:${string}`;

type PermissionContext = {
  tenantId?: string;
};

/**
 * Role hierarchy (higher index = more privileges):
 *
 * PLATFORM_ADMIN (internal platform support only)
 *   └── ADMIN  (tenant owner / full access)
 *         ├── MANAGER  (team lead / CRUD on most resources)
 *         └── USER     (standard user / read + limited write)
 *               └── VIEWER (read-only)
 */
const ROLE_HIERARCHY: Record<Role, Role[]> = {
  PLATFORM_ADMIN: ['ADMIN', 'MANAGER', 'USER', 'VIEWER'],
  ADMIN: ['MANAGER', 'USER', 'VIEWER'],
  MANAGER: ['USER', 'VIEWER'],
  USER: ['VIEWER'],
  VIEWER: [],
};

/**
 * Permission map: which roles are directly granted which permissions.
 * A role also inherits all permissions from roles below it in the hierarchy.
 *
 * This is a skeleton — fill in permissions as features are built.
 * Convention: [domain]:[resource]:[action]
 */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  PLATFORM_ADMIN: [
    'platform:tenants:read',
    'platform:tenants:create',
    'platform:tenants:delete',
    'platform:flags:manage',
  ],

  ADMIN: [
    'settings:users:invite',
    'settings:users:remove',
    'settings:config:update',
    'settings:flags:manage',
  ],

  MANAGER: [
    'settings:users:read',
    'resources:records:create',
    'resources:records:update',
  ],

  USER: [
    'resources:records:read',
    'resources:records:create',
  ],

  VIEWER: [
    'resources:records:read',
  ],
};

function getEffectivePermissions(role: Role): Set<Permission> {
  const permissions = new Set<Permission>(ROLE_PERMISSIONS[role]);
  for (const inheritedRole of ROLE_HIERARCHY[role]) {
    for (const perm of ROLE_PERMISSIONS[inheritedRole]) {
      permissions.add(perm);
    }
  }
  return permissions;
}

/**
 * Check if a user has a specific role-based permission.
 * Run AFTER auth and AFTER tenant isolation.
 *
 * @param session    - The authenticated user's session context
 * @param permission - The permission to check (e.g. 'settings:users:invite')
 */
export function canUser(
  session: SessionContext,
  permission: Permission,
  _context?: PermissionContext,
): boolean {
  const role = session.role as Role;
  const effectivePermissions = getEffectivePermissions(role);
  return effectivePermissions.has(permission);
}

/**
 * Unified authorization check: role-based permission AND feature flag.
 *
 * Combines canUser() (in-memory role hierarchy) with featureFlags.isEnabled()
 * (Postgres overrides + external adapter). If either denies, access is denied.
 *
 * @param session        - The authenticated user's session context
 * @param permission     - The role-based permission to check
 * @param featureFlagKey - Optional feature flag key
 */
export async function canAccess(
  session: SessionContext,
  permission: Permission,
  featureFlagKey?: string,
): Promise<boolean> {
  // 1. Role-based check (synchronous, in-memory)
  if (!canUser(session, permission)) return false;

  // 2. Feature flag check (async, hits cache or Postgres)
  if (featureFlagKey) {
    const enabled = await featureFlags.isEnabled(featureFlagKey, {
      tenantId: session.tenantId,
    });
    if (!enabled) return false;
  }

  return true;
}

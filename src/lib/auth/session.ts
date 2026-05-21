import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

export type SessionContext = {
  userId: string;
  externalId: string;
  tenantId: string;
  role: string;
  email: string;
};

const DEV_BYPASS_ENABLED =
  process.env.NODE_ENV !== 'production' && process.env.DEV_BYPASS_AUTH === 'true';

function getDevBypassSession(): SessionContext {
  return {
    userId: process.env.DEV_BYPASS_USER_ID ?? '00000000-0000-0000-0000-000000000001',
    externalId: process.env.DEV_BYPASS_EXTERNAL_ID ?? 'dev-user',
    tenantId: process.env.DEV_BYPASS_TENANT_ID ?? '00000000-0000-0000-0000-000000000001',
    role: process.env.DEV_BYPASS_ROLE ?? 'PLATFORM_ADMIN',
    email: process.env.DEV_BYPASS_EMAIL ?? 'dev@payevo.local',
  };
}

/**
 * Resolves the authenticated user's session context.
 * TODO: Integrate your Identity Provider — validate the incoming token (JWT/session
 *       cookie), extract claims, and map to a SessionContext.
 *
 * Currently returns the first PLATFORM_ADMIN user from the database as a dev bypass.
 * Replace this entire function before going to production.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  if (DEV_BYPASS_ENABLED) {
    return getDevBypassSession();
  }

  try {
    // Dev bootstrap: return first PLATFORM_ADMIN user from database.
    const user = await prisma.user.findFirst({
      where: { role: 'PLATFORM_ADMIN' },
      select: {
        id: true,
        externalId: true,
        tenantId: true,
        role: true,
        email: true,
      },
    });

    if (!user) return null;

    return {
      userId: user.id,
      externalId: user.externalId,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    };
  } catch (error) {
    logger.warn({ err: error }, 'Failed to resolve session context');
    return null;
  }
}

/**
 * Validates that a resource belongs to the session's tenant.
 * Returns false if tenant doesn't match — caller should return 404 (not 403) to
 * avoid leaking the existence of cross-tenant resources.
 */
export function belongsToTenant(session: SessionContext, resourceTenantId: string): boolean {
  return session.tenantId === resourceTenantId;
}

import { prisma } from '@/lib/db/prisma';

export type SessionContext = {
  userId: string;
  externalId: string;
  tenantId: string;
  role: string;
  email: string;
};

/**
 * Resolves the authenticated user's session context.
 * TODO: Integrate your Identity Provider — validate the incoming token (JWT/session
 *       cookie), extract claims, and map to a SessionContext.
 *
 * Currently returns the first PLATFORM_ADMIN user from the database as a dev bypass.
 * Replace this entire function before going to production.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  // Dev bypass — return the first PLATFORM_ADMIN user from the database
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
}

/**
 * Validates that a resource belongs to the session's tenant.
 * Returns false if tenant doesn't match — caller should return 404 (not 403) to
 * avoid leaking the existence of cross-tenant resources.
 */
export function belongsToTenant(session: SessionContext, resourceTenantId: string): boolean {
  return session.tenantId === resourceTenantId;
}

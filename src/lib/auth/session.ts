import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

export type SessionContext = {
  userId: string;
  externalId: string;
  tenantId: string;
  role: string;
  email: string;
};

// Explicit opt-in bypass for local/dev environments without an IdP.
// Keep disabled by default and only enable via environment configuration.
const DEV_BYPASS_ENABLED = process.env.DEV_BYPASS_AUTH === 'true';
const SEEDED_DEV_EXTERNAL_ID = 'ext_platform_admin_001';

function toSessionContext(user: {
  id: string;
  externalId: string;
  tenantId: string;
  role: string;
  email: string;
}): SessionContext {
  return {
    userId: user.id,
    externalId: user.externalId,
    tenantId: user.tenantId,
    role: user.role,
    email: user.email,
  };
}

async function findUserByDevBypassEnv(): Promise<SessionContext | null> {
  const configuredExternalId = process.env.DEV_BYPASS_EXTERNAL_ID;
  const configuredUserId = process.env.DEV_BYPASS_USER_ID;
  const configuredTenantId = process.env.DEV_BYPASS_TENANT_ID;

  try {
    if (configuredExternalId) {
      const userByExternalId = await prisma.user.findUnique({
        where: { externalId: configuredExternalId },
        select: {
          id: true,
          externalId: true,
          tenantId: true,
          role: true,
          email: true,
        },
      });

      if (userByExternalId) {
        if (configuredTenantId && configuredTenantId !== userByExternalId.tenantId) {
          logger.warn(
            {
              configuredTenantId,
              resolvedTenantId: userByExternalId.tenantId,
              externalId: configuredExternalId,
            },
            'DEV_BYPASS_TENANT_ID does not match resolved user tenant; using resolved tenant from database',
          );
        }

        return toSessionContext(userByExternalId);
      }

      logger.warn(
        { externalId: configuredExternalId },
        'DEV_BYPASS_EXTERNAL_ID not found; falling back to seeded defaults',
      );
    }

    if (configuredUserId) {
      const userById = await prisma.user.findUnique({
        where: { id: configuredUserId },
        select: {
          id: true,
          externalId: true,
          tenantId: true,
          role: true,
          email: true,
        },
      });

      if (userById) {
        if (configuredTenantId && configuredTenantId !== userById.tenantId) {
          logger.warn(
            { configuredTenantId, resolvedTenantId: userById.tenantId, userId: configuredUserId },
            'DEV_BYPASS_TENANT_ID does not match resolved user tenant; using resolved tenant from database',
          );
        }

        return toSessionContext(userById);
      }

      logger.warn(
        { userId: configuredUserId },
        'DEV_BYPASS_USER_ID not found; falling back to seeded defaults',
      );
    }
  } catch (error) {
    logger.warn({ err: error }, 'Failed to resolve DEV_BYPASS_* user');
  }

  return null;
}

async function getNonProductionFallbackSession(): Promise<SessionContext | null> {
  try {
    const seededPlatformAdmin = await prisma.user.findUnique({
      where: { externalId: SEEDED_DEV_EXTERNAL_ID },
      select: {
        id: true,
        externalId: true,
        tenantId: true,
        role: true,
        email: true,
      },
    });

    if (seededPlatformAdmin) {
      return toSessionContext(seededPlatformAdmin);
    }

    const fallbackUser = await prisma.user.findFirst({
      select: {
        id: true,
        externalId: true,
        tenantId: true,
        role: true,
        email: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (fallbackUser) {
      return toSessionContext(fallbackUser);
    }
  } catch (error) {
    logger.warn({ err: error }, 'Failed to resolve non-production fallback user');
  }

  logger.error(
    'No seeded users found for non-production auth fallback. Run `npm run db:seed` and set DEV_BYPASS_EXTERNAL_ID=ext_platform_admin_001.',
  );
  return null;
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
    const bypassUser = await findUserByDevBypassEnv();
    if (bypassUser) {
      return bypassUser;
    }

    return getNonProductionFallbackSession();
  }

  const isNonProduction = process.env.NODE_ENV !== 'production';

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

    if (!user) {
      if (isNonProduction) {
        logger.warn('No PLATFORM_ADMIN user found; using non-production auth fallback session');
        return getNonProductionFallbackSession();
      }
      return null;
    }

    return toSessionContext(user);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to resolve session context');
    if (isNonProduction) {
      logger.warn('Using non-production auth fallback session after session resolution failure');
      return getNonProductionFallbackSession();
    }
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

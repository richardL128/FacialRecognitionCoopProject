import { NextRequest, NextResponse } from 'next/server';
import { withApi } from '@/lib/api/handler';
import { prisma } from '@/lib/db/prisma';
import { apiSuccess, apiError } from '@/types/api';
import { auditLog } from '@/lib/audit/logger';
import { featureFlags } from '@/lib/feature-flags';

/**
 * DELETE /api/support/feature-flags/[id]
 *
 * Remove a feature flag override (reverts to default behaviour for that scope).
 * Restricted to PLATFORM_ADMIN only.
 */
export const DELETE = withApi(async (request: NextRequest, { session, params }) => {
  if (session.role !== 'PLATFORM_ADMIN') {
    return NextResponse.json(apiError('FORBIDDEN', 'Platform support access required'), {
      status: 403,
    });
  }

  const { id } = params;

  const override = await prisma.featureFlagOverride.findUnique({
    where: { id },
  });

  if (!override) {
    return NextResponse.json(apiError('NOT_FOUND', 'Override not found'), { status: 404 });
  }

  await prisma.featureFlagOverride.delete({ where: { id } });

  featureFlags.clearCache();

  auditLog({
    tenantId: override.tenantId ?? session.tenantId,
    userId: session.userId,
    action: 'feature.flag.override.deleted',
    entityType: 'FeatureFlagOverride',
    entityId: id,
    beforeData: {
      flagKey: override.flagKey,
      scope: override.scope,
      tenantId: override.tenantId,
      enabled: override.enabled,
    },
    request,
  }).catch(() => {});

  return NextResponse.json(apiSuccess({ deleted: true }));
});

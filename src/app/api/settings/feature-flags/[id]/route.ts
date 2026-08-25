import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApi } from '@/lib/api/handler';
import { prisma } from '@/lib/db/prisma';
import { apiSuccess, apiError } from '@/types/api';
import { auditLog } from '@/lib/audit/logger';
import { featureFlags } from '@/lib/feature-flags';

const ADMIN_ROLES = ['ADMIN', 'PLATFORM_ADMIN'];
const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * DELETE /api/settings/feature-flags/[id]
 *
 * Remove a CLIENT-level override (reverts to default behaviour).
 * Restricted to ADMIN and PLATFORM_ADMIN roles.
 */
export const DELETE = withApi(async (request: NextRequest, { session, params }) => {
  if (!ADMIN_ROLES.includes(session.role)) {
    return NextResponse.json(apiError('FORBIDDEN', 'Admin access required'), { status: 403 });
  }

  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json(apiError('VALIDATION_ERROR', 'Invalid override id'), { status: 400 });
  }

  const { id } = parsedParams.data;

  // Fetch override and verify it belongs to this tenant
  const override = await prisma.featureFlagOverride.findUnique({
    where: { id },
  });

  if (!override) {
    return NextResponse.json(apiError('NOT_FOUND', 'Override not found'), { status: 404 });
  }

  // Tenant admins can only delete CLIENT-scoped overrides for their own tenant
  if (override.scope !== 'CLIENT' || override.tenantId !== session.tenantId) {
    return NextResponse.json(apiError('FORBIDDEN', 'Access denied'), { status: 403 });
  }

  await prisma.featureFlagOverride.delete({ where: { id } });

  featureFlags.clearCache();

  auditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: 'feature.flag.override.deleted',
    entityType: 'FeatureFlagOverride',
    entityId: id,
    beforeData: { flagKey: override.flagKey, scope: override.scope, enabled: override.enabled },
    request,
  }).catch(() => {});

  return NextResponse.json(apiSuccess({ deleted: true }));
});

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApi } from '@/lib/api/handler';
import { prisma } from '@/lib/db/prisma';
import { apiSuccess, apiError } from '@/types/api';
import { auditLog } from '@/lib/audit/logger';
import { FEATURE_FLAG_CATALOG, FLAG_META_MAP } from '@/constants/featureFlagCatalog';
import { featureFlags } from '@/lib/feature-flags';

/**
 * GET /api/support/feature-flags
 *
 * Returns all feature flag overrides + the catalog of known flags + all tenants.
 * Restricted to PLATFORM_ADMIN only.
 */
export const GET = withApi(async (_request: NextRequest, { session }) => {
  if (session.role !== 'PLATFORM_ADMIN') {
    return NextResponse.json(apiError('FORBIDDEN', 'Platform support access required'), {
      status: 403,
    });
  }

  const overrides = await prisma.featureFlagOverride.findMany({
    orderBy: [{ flagKey: 'asc' }, { scope: 'asc' }],
  });

  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, slug: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(
    apiSuccess({
      catalog: FEATURE_FLAG_CATALOG,
      overrides,
      tenants,
      cacheStats: featureFlags.getCacheStats(),
    }),
  );
});

const createSchema = z.object({
  flagKey: z.string().min(1).max(200),
  scope: z.enum(['GLOBAL', 'TENANT']),
  tenantId: z.string().uuid().nullable(),
  enabled: z.boolean(),
  reason: z.string().max(500).optional(),
});

/**
 * POST /api/support/feature-flags
 *
 * Create or update a feature flag override. Upserts by (flagKey, scope, tenantId).
 * Restricted to PLATFORM_ADMIN only.
 */
export const POST = withApi(async (request: NextRequest, { session }) => {
  if (session.role !== 'PLATFORM_ADMIN') {
    return NextResponse.json(apiError('FORBIDDEN', 'Platform support access required'), {
      status: 403,
    });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      apiError('VALIDATION_ERROR', 'Invalid request body', parsed.error.flatten()),
      { status: 400 },
    );
  }

  const { flagKey, scope, tenantId, enabled, reason } = parsed.data;

  if (scope === 'GLOBAL' && tenantId) {
    return NextResponse.json(
      apiError('VALIDATION_ERROR', 'GLOBAL overrides cannot have a tenantId'),
      { status: 400 },
    );
  }
  if (scope === 'TENANT' && !tenantId) {
    return NextResponse.json(apiError('VALIDATION_ERROR', 'TENANT overrides require a tenantId'), {
      status: 400,
    });
  }

  const override = await prisma.featureFlagOverride.upsert({
    where: {
      uq_flag_override: {
        flagKey,
        scope,
        tenantId: tenantId ?? '00000000-0000-0000-0000-000000000000',
        scopeId: null as unknown as string,
      },
    },
    create: {
      flagKey,
      scope,
      tenantId,
      scopeId: null,
      enabled,
      reason: reason ?? null,
      setBy: session.userId,
    },
    update: {
      enabled,
      reason: reason ?? null,
      setBy: session.userId,
    },
  });

  featureFlags.clearCache();

  const meta = FLAG_META_MAP.get(flagKey);
  auditLog({
    tenantId: tenantId ?? session.tenantId,
    userId: session.userId,
    action: enabled ? 'feature.flag.enabled' : 'feature.flag.disabled',
    entityType: 'FeatureFlagOverride',
    entityId: override.id,
    afterData: { flagKey, scope, tenantId, enabled, reason, label: meta?.label },
    request,
  }).catch(() => {});

  return NextResponse.json(apiSuccess(override), { status: 200 });
});

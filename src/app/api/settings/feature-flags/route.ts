import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApi } from '@/lib/api/handler';
import { prisma } from '@/lib/db/prisma';
import { apiSuccess, apiError } from '@/types/api';
import { auditLog } from '@/lib/audit/logger';
import { featureFlags } from '@/lib/feature-flags';
import { FLAG_META_MAP, flagsByScope } from '@/constants/featureFlagCatalog';

const ADMIN_ROLES = ['ADMIN', 'PLATFORM_ADMIN'];

/**
 * GET /api/settings/feature-flags
 *
 * Returns the feature flags that the Tenant Admin can manage (CLIENT-scoped flags),
 * the current CLIENT-level overrides for their tenant, and the list of entities.
 * Restricted to ADMIN and PLATFORM_ADMIN roles.
 *
 * TODO: Replace the empty `clients` array below with a query to your own entity
 *       table once you have a "client" / "group" / "team" concept in your schema.
 *       The CLIENT scope in FeatureFlagOverride uses `scopeId` to reference these entities.
 */
export const GET = withApi(async (_request: NextRequest, { session }) => {
  if (!ADMIN_ROLES.includes(session.role)) {
    return NextResponse.json(apiError('FORBIDDEN', 'Admin access required'), { status: 403 });
  }

  const clientFlags = flagsByScope('client');

  const overrides = await prisma.featureFlagOverride.findMany({
    where: { scope: 'CLIENT', tenantId: session.tenantId },
    orderBy: [{ flagKey: 'asc' }, { scopeId: 'asc' }],
  });

  const tenantOverrides = await prisma.featureFlagOverride.findMany({
    where: { scope: 'TENANT', tenantId: session.tenantId },
    select: { flagKey: true, enabled: true },
  });

  const globalOverrides = await prisma.featureFlagOverride.findMany({
    where: { scope: 'GLOBAL', enabled: false },
    select: { flagKey: true, enabled: true },
  });

  // TODO: Replace with your entity query (e.g. prisma.client.findMany, prisma.team.findMany)
  const clients: { id: string; name: string }[] = [];

  return NextResponse.json(
    apiSuccess({
      catalog: clientFlags,
      overrides,
      tenantOverrides,
      globalOverrides,
      clients,
    }),
  );
});

const upsertSchema = z.object({
  flagKey: z.string().min(1).max(200),
  clientId: z.string().uuid(),
  enabled: z.boolean(),
  reason: z.string().max(500).optional(),
});

/**
 * POST /api/settings/feature-flags
 *
 * Create or update a CLIENT-level feature flag override.
 * Tenant Admin can only set CLIENT-scoped overrides within their own tenant.
 */
export const POST = withApi(async (request: NextRequest, { session }) => {
  if (!ADMIN_ROLES.includes(session.role)) {
    return NextResponse.json(apiError('FORBIDDEN', 'Admin access required'), { status: 403 });
  }

  const body = await request.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      apiError('VALIDATION_ERROR', 'Invalid request body', parsed.error.flatten()),
      { status: 400 },
    );
  }

  const { flagKey, clientId, enabled, reason } = parsed.data;

  // Validate the flag exists and allows CLIENT scope
  const meta = FLAG_META_MAP.get(flagKey);
  if (!meta || !meta.allowedScopes.includes('client')) {
    return NextResponse.json(
      apiError('VALIDATION_ERROR', 'This flag cannot be set at the client level'),
      { status: 400 },
    );
  }

  // TODO: Verify clientId belongs to this tenant before upserting.
  // e.g. const entity = await prisma.yourEntity.findFirst({ where: { id: clientId, tenantId: session.tenantId } });
  // if (!entity) return NextResponse.json(apiError('NOT_FOUND', 'Entity not found'), { status: 404 });

  const override = await prisma.featureFlagOverride.upsert({
    where: {
      uq_flag_override: {
        flagKey,
        scope: 'CLIENT',
        tenantId: session.tenantId,
        scopeId: clientId,
      },
    },
    create: {
      flagKey,
      scope: 'CLIENT',
      tenantId: session.tenantId,
      scopeId: clientId,
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

  auditLog({
    tenantId: session.tenantId,
    userId: session.userId,
    action: enabled ? 'feature.flag.client.enabled' : 'feature.flag.client.disabled',
    entityType: 'FeatureFlagOverride',
    entityId: override.id,
    afterData: { flagKey, clientId, enabled, reason, label: meta.label },
    request,
  }).catch(() => {});

  return NextResponse.json(apiSuccess(override), { status: 200 });
});

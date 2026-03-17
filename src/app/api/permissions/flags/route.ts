import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApi } from '@/lib/api/handler';
import { featureFlags } from '@/lib/feature-flags';
import { apiSuccess } from '@/types/api';

const querySchema = z.object({
  groupIds: z.string().optional(),
  key: z.string().optional(),
});

/**
 * GET /api/permissions/flags?key=someKey
 * GET /api/permissions/flags?key=key1&key=key2  (batch — multiple key params)
 *
 * Returns feature flag enabled/disabled status for the current user's context.
 * Used by frontend hooks (useFeatureFlag, useFeatureFlags, usePermissionKeys).
 */
export const GET = withApi(
  async (request: NextRequest, { session }) => {
    const url = new URL(request.url);
    const keyParams = url.searchParams.getAll('key');

    const ctx = {
      tenantId: session.tenantId,
    };

    // Batch key check — returns { flags: Record<string, boolean> }
    if (keyParams.length > 1) {
      const flags: Record<string, boolean> = {};
      await Promise.all(
        keyParams.map(async (k) => {
          flags[k] = await featureFlags.isEnabled(k, ctx);
        }),
      );
      return NextResponse.json(apiSuccess({ flags }), {
        headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=30' },
      });
    }

    // Single key check — returns { enabled: boolean }
    if (keyParams.length === 1) {
      const enabled = await featureFlags.isEnabled(keyParams[0]!, ctx);
      return NextResponse.json(apiSuccess({ key: keyParams[0], enabled }), {
        headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=30' },
      });
    }

    // No key params — return empty keys array (for usePermissionKeys compatibility)
    return NextResponse.json(apiSuccess({ keys: [] }), {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=30' },
    });
  },
  { querySchema },
);

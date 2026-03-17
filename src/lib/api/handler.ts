import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema } from 'zod';
import { getSessionContext, type SessionContext } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { featureFlags } from '@/lib/feature-flags';
import { auditLog } from '@/lib/audit/logger';
import { requestLogger } from '@/lib/logger';
import { apiError } from '@/types/api';

type ApiContext = {
  session: SessionContext;
  params: Record<string, string>;
};

type ApiHandler = (request: NextRequest, context: ApiContext) => Promise<NextResponse>;

type ApiRouteOptions = {
  /** Zod schema for request body validation (POST/PUT/PATCH) */
  bodySchema?: ZodSchema;
  /** Zod schema for search params validation */
  querySchema?: ZodSchema;
  /** Feature flag key — if set, the route is gated behind this flag */
  featureFlag?: string;
};

/**
 * Wraps an API route handler with standard middleware:
 * 1. Auth (session resolution)
 * 2. Body/query validation (Zod)
 * 3. Feature flag gate (optional)
 * 4. Structured error handling
 * 5. Request logging
 */
export function withApi(handler: ApiHandler, options: ApiRouteOptions = {}) {
  return async (
    request: NextRequest,
    routeContext: { params: Promise<Record<string, string>> },
  ) => {
    const url = new URL(request.url);
    const params = await routeContext.params;

    // 1. Auth — resolve session
    const session = await getSessionContext();
    if (!session) {
      return NextResponse.json(apiError('UNAUTHORIZED', 'Authentication required'), {
        status: 401,
      });
    }

    const log = requestLogger({
      method: request.method,
      path: url.pathname,
      tenantId: session.tenantId,
      userId: session.userId,
    });

    try {
      // 2. Validate body
      if (options.bodySchema && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
        const body = await request.json();
        const result = options.bodySchema.safeParse(body);
        if (!result.success) {
          return NextResponse.json(
            apiError('VALIDATION_ERROR', 'Invalid request body', result.error.flatten()),
            { status: 400 },
          );
        }
      }

      // 3. Validate query params
      if (options.querySchema) {
        const queryObj = Object.fromEntries(url.searchParams.entries());
        const result = options.querySchema.safeParse(queryObj);
        if (!result.success) {
          return NextResponse.json(
            apiError('VALIDATION_ERROR', 'Invalid query parameters', result.error.flatten()),
            { status: 400 },
          );
        }
      }

      // 4. Feature flag gate (checks Postgres overrides)
      if (options.featureFlag) {
        const enabled = await featureFlags.isEnabled(options.featureFlag, {
          tenantId: session.tenantId,
        });
        if (!enabled) {
          auditLog({
            tenantId: session.tenantId,
            userId: session.userId,
            action: 'feature.flag.denied',
            entityType: 'FeatureFlag',
            entityId: options.featureFlag,
            afterData: { featureFlag: options.featureFlag },
            request,
          }).catch(() => {});

          return NextResponse.json(
            apiError('FEATURE_DISABLED', `Feature '${options.featureFlag}' is not enabled`),
            { status: 404 },
          );
        }
      }

      // 5. Execute handler (permissions + tenant check + DB + audit happen inside)
      return await handler(request, { session, params });
    } catch (error) {
      if (error instanceof AppError) {
        log.warn({ err: error }, error.message);
        return NextResponse.json(apiError(error.code, error.message), {
          status: error.statusCode,
        });
      }

      log.error({ err: error }, 'Unhandled error in API route');
      return NextResponse.json(apiError('INTERNAL_ERROR', 'Internal server error'), {
        status: 500,
      });
    }
  };
}

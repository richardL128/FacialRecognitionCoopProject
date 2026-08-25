import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema } from 'zod';
import { getSessionContext, type SessionContext } from '@/lib/auth/session';
import { AppError } from '@/lib/errors';
import { classifyDatabaseError, isLikelyDatabaseError } from '@/lib/db/error-classifier';
import { getDatabaseStartupConfigError } from '@/lib/db/prisma';
import { featureFlags } from '@/lib/feature-flags';
import { auditLog } from '@/lib/audit/logger';
import { requestLogger } from '@/lib/logger';
import { apiError } from '@/types/api';
import { extractRateLimitKey, formatRateLimitHeaders, rateLimit } from '@/lib/rate-limiter';

type ApiContext = {
  session: SessionContext;
  params: Record<string, string>;
  requestId: string;
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
    const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
    const url = new URL(request.url);
    const params = await routeContext.params;

    const databaseConfigError = getDatabaseStartupConfigError();
    if (databaseConfigError) {
      const response = NextResponse.json(
        apiError('DATABASE_URL_INVALID', databaseConfigError, {
          requestId,
          context: `${request.method} ${url.pathname}`,
        }),
        { status: 500 },
      );
      response.headers.set('x-request-id', requestId);
      return response;
    }

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
      requestId,
    });

    // 2. Rate limiting — per-user or per-IP sliding window
    const rateKey = extractRateLimitKey(request);
    const rateResult = rateLimit(rateKey, url.pathname);
    if (!rateResult.allowed) {
      const retryAfter = Math.ceil((rateResult.resetAt.getTime() - Date.now()) / 1000);
      log.warn(
        { ip: rateKey.identifier, limit: rateResult.limit, retryAfter },
        'Rate limit exceeded',
      );
      const response = NextResponse.json(
        apiError('RATE_LIMIT_EXCEEDED', 'Too many requests. Please try again later.', {
          requestId,
          retryAfter,
        }),
        { status: 429 },
      );
      response.headers.set('x-request-id', requestId);
      for (const [key, value] of Object.entries(formatRateLimitHeaders(rateResult))) {
        response.headers.set(key, value);
      }
      return response;
    }

    try {
      // 3. Validate body
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

      // 4. Validate query params
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

      // 5. Feature flag gate (checks Postgres overrides)
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

      // 6. Execute handler (permissions + tenant check + DB + audit happen inside)
      const response = await handler(request, { session, params, requestId });
      response.headers.set('x-request-id', requestId);
      // Attach rate limit headers to successful responses
      for (const [key, value] of Object.entries(formatRateLimitHeaders(rateResult))) {
        response.headers.set(key, value);
      }
      return response;
    } catch (error) {
      if (error instanceof AppError) {
        log.warn({ err: error }, error.message);
        const response = NextResponse.json(apiError(error.code, error.message, { requestId }), {
          status: error.statusCode,
        });
        response.headers.set('x-request-id', requestId);
        return response;
      }

      if (error instanceof Error) {
        if (isLikelyDatabaseError(error)) {
          const classified = classifyDatabaseError(error, `${request.method} ${url.pathname}`);
          log.error({ err: error, classified }, 'Unhandled database error in API route');
          const response = NextResponse.json(
            apiError(classified.code, classified.message, {
              requestId,
              ...classified.details,
            }),
            {
              status: classified.status,
            },
          );
          response.headers.set('x-request-id', requestId);
          return response;
        }
      }

      log.error({ err: error }, 'Unhandled error in API route');
      const response = NextResponse.json(
        apiError('INTERNAL_ERROR', 'Internal server error', { requestId }),
        {
          status: 500,
        },
      );
      response.headers.set('x-request-id', requestId);
      return response;
    }
  };
}

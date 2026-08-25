import { NextRequest, NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/auth/session';
import { apiSuccess, apiError } from '@/types/api';
import { extractRateLimitKey, formatRateLimitHeaders, rateLimit } from '@/lib/rate-limiter';

/**
 * GET /api/auth/me
 *
 * Returns the current user's basic session info (role, email, tenantId).
 * Used by client components to conditionally render UI based on role.
 */
export async function GET(request: NextRequest) {
  // Rate limiting — per-user or per-IP sliding window
  const rateKey = extractRateLimitKey(request);
  const rateResult = rateLimit(rateKey, '/api/auth/me');
  if (!rateResult.allowed) {
    const retryAfter = Math.ceil((rateResult.resetAt.getTime() - Date.now()) / 1000);
    const response = NextResponse.json(
      apiError('RATE_LIMIT_EXCEEDED', 'Too many requests. Please try again later.', { retryAfter }),
      { status: 429 },
    );
    for (const [key, value] of Object.entries(formatRateLimitHeaders(rateResult))) {
      response.headers.set(key, value);
    }
    return response;
  }

  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json(apiError('UNAUTHORIZED', 'Not authenticated'), { status: 401 });
  }

  const response = NextResponse.json(
    apiSuccess({
      userId: session.userId,
      role: session.role,
      email: session.email,
      tenantId: session.tenantId,
    }),
    { headers: { 'Cache-Control': 'private, max-age=60' } },
  );

  // Attach rate limit headers
  for (const [key, value] of Object.entries(formatRateLimitHeaders(rateResult))) {
    response.headers.set(key, value);
  }
  return response;
}

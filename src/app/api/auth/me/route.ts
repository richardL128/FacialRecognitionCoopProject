import { NextRequest, NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/auth/session';
import { apiSuccess, apiError } from '@/types/api';

/**
 * GET /api/auth/me
 *
 * Returns the current user's basic session info (role, email, tenantId).
 * Used by client components to conditionally render UI based on role.
 */
export async function GET(_request: NextRequest) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json(apiError('UNAUTHORIZED', 'Not authenticated'), { status: 401 });
  }

  return NextResponse.json(
    apiSuccess({
      userId: session.userId,
      role: session.role,
      email: session.email,
      tenantId: session.tenantId,
    }),
    { headers: { 'Cache-Control': 'private, max-age=60' } },
  );
}

import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js Edge Middleware — runs before every matched request.
 *
 * Global kill switches:
 * Kill switches are controlled via environment variables for instant toggle
 * without a code deploy (via your deployment config or secrets manager).
 *
 * Set KILL_SWITCH_<NAME>=true to disable the corresponding path globally.
 * The matching request is rewritten to /feature-unavailable.
 *
 * When your platform supports a lightweight kill-switch endpoint (e.g. a
 * Redis flag or a cached API call), this can be replaced with a dynamic check.
 */

// Kill switches: env-var based for instant toggle without code deploy.
// Format: path prefix → env var name
// Add your own routes here as you build features:
const KILL_SWITCHES: Record<string, string> = {
  '/feature-a': 'KILL_SWITCH_FEATURE_A',
  '/feature-b': 'KILL_SWITCH_FEATURE_B',
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check kill switches for matching path prefixes (page routes)
  for (const [pathPrefix, envVar] of Object.entries(KILL_SWITCHES)) {
    if (pathname === pathPrefix || pathname.startsWith(pathPrefix + '/')) {
      if (process.env[envVar] === 'true') {
        const url = request.nextUrl.clone();
        url.pathname = '/feature-unavailable';
        return NextResponse.rewrite(url);
      }
    }
  }

  // Check kill switches for API routes
  if (pathname.startsWith('/api/')) {
    for (const [pathPrefix, envVar] of Object.entries(KILL_SWITCHES)) {
      if (pathname.startsWith(`/api${pathPrefix}`)) {
        if (process.env[envVar] === 'true') {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'FEATURE_DISABLED',
                message: 'This feature is temporarily unavailable',
              },
            },
            { status: 503 },
          );
        }
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  // Match all routes except static assets and Next.js internals
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};

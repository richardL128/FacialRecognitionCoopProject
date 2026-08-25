import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js Edge Middleware — runs before every matched request.
 *
 * Responsibilities:
 * 1. Kill switches (env-var based feature toggles)
 * 2. Rate limiting (per-IP sliding window via shared store)
 * 3. Security headers
 *
 * ─── Rate Limiting ──────────────────────────────────────────────────────
 * Edge middleware runs in V8 isolates — each isolate has its own Map.
 * For production, replace the in-memory store with Redis/Upstash.
 * This provides per-isolate protection; burst limits may vary slightly
 * across isolates but cumulative enforcement still applies.
 *
 * Configured via environment variables:
 *   RATE_LIMIT_WINDOW_MS    — window duration in ms (default: 60_000)
 *   RATE_LIMIT_MAX_REQUESTS — max requests per window per IP (default: 100)
 *   RATE_LIMIT_AUTH_MAX     — stricter limit for /api/auth/* (default: 20)
 *   RATE_LIMIT_RECOGNIZE_MAX— stricter limit for /api/camera/recognize (default: 30)
 */

// Kill switches: env-var based for instant toggle without code deploy.
const KILL_SWITCHES: Record<string, string> = {
  '/feature-a': 'KILL_SWITCH_FEATURE_A',
};

// ─── Edge-compatible rate limiter ─────────────────────────────────────────

interface RateLimitEntry {
  timestamp: number;
}

const EDGE_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const EDGE_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 100);
const EDGE_AUTH_MAX = Number(process.env.RATE_LIMIT_AUTH_MAX ?? 20);
const EDGE_RECOGNIZE_MAX = Number(process.env.RATE_LIMIT_RECOGNIZE_MAX ?? 30);

// Per-isolate in-memory store (production should use Redis)
const edgeStore = new Map<string, RateLimitEntry[]>();

function getEdgeLimitForPath(pathname: string): number {
  if (pathname.startsWith('/api/auth/')) return EDGE_AUTH_MAX;
  if (pathname.startsWith('/api/camera/recognize')) return EDGE_RECOGNIZE_MAX;
  return EDGE_MAX_REQUESTS;
}

function checkEdgeRateLimit(ip: string, pathname: string): {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
} {
  const now = Date.now();
  const windowStart = now - EDGE_WINDOW_MS;
  const limit = getEdgeLimitForPath(pathname);

  let entries = edgeStore.get(ip) ?? [];
  entries = entries.filter((e) => e.timestamp > windowStart);

  const remaining = Math.max(0, limit - entries.length);
  const allowed = entries.length < limit;

  const oldestEntry = entries[0];
  const resetAt = oldestEntry
    ? new Date(oldestEntry.timestamp + EDGE_WINDOW_MS)
    : new Date(now + EDGE_WINDOW_MS);

  if (allowed) {
    entries.push({ timestamp: now });
    edgeStore.set(ip, entries);
  }

  return { allowed, limit, remaining: allowed ? remaining - 1 : 0, resetAt };
}

// ─── Security headers ─────────────────────────────────────────────────────

function securityHeaders(): HeadersInit {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '0', // Modern browsers use CSP instead
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };
}

// ─── Middleware ─────────────────────────────────────────────────────────────

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Kill switches (page routes) ────────────────────────────────────────
  for (const [pathPrefix, envVar] of Object.entries(KILL_SWITCHES)) {
    if (pathname === pathPrefix || pathname.startsWith(pathPrefix + '/')) {
      if (process.env[envVar] === 'true') {
        const url = request.nextUrl.clone();
        url.pathname = '/feature-unavailable';
        return NextResponse.rewrite(url);
      }
    }
  }

  // ── Kill switches (API routes) ─────────────────────────────────────────
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

  // ── Rate limiting (API routes only) ────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const rateResult = checkEdgeRateLimit(ip, pathname);

    const responseHeaders = securityHeaders();

    if (!rateResult.allowed) {
      const retryAfter = Math.ceil((rateResult.resetAt.getTime() - Date.now()) / 1000);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
            retryAfter,
          },
        },
        {
          status: 429,
          headers: {
            ...responseHeaders,
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(rateResult.limit),
            'X-RateLimit-Remaining': '0',
          },
        },
      );
    }

    // Attach rate limit headers to successful requests
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', String(rateResult.limit));
    response.headers.set('X-RateLimit-Remaining', String(rateResult.remaining));
    const retryAfterSec = Math.ceil((rateResult.resetAt.getTime() - Date.now()) / 1000);
    response.headers.set('X-RateLimit-Reset', String(retryAfterSec));
    return response;
  }

  // ── Security headers for page routes ───────────────────────────────────
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(securityHeaders())) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  // Match all routes except static assets and Next.js internals
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};

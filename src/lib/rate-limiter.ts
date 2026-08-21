/**
 * In-memory rate limiter for Next.js API routes.
 *
 * Uses a sliding-window algorithm with per-key limits.
 * No external dependencies — works without Redis/Upstash.
 *
 * Configured via environment variables:
 *   RATE_LIMIT_WINDOW_MS    — window duration in ms (default: 60_000 = 1 min)
 *   RATE_LIMIT_MAX_REQUESTS — max requests per window per key (default: 100)
 *   RATE_LIMIT_AUTH_MAX     — stricter limit for auth endpoints (default: 20)
 *   RATE_LIMIT_RECOGNIZE_MAX— stricter limit for face recognition (default: 30)
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface RateLimitKey {
  identifier: string; // IP address or user ID
}

interface RateLimitEntry {
  timestamp: number;
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  windowMs: number;
}

// ─── Configuration ──────────────────────────────────────────────────────────

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000); // 1 minute
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 100);
const AUTH_MAX_REQUESTS = Number(process.env.RATE_LIMIT_AUTH_MAX ?? 20);
const RECOGNIZE_MAX_REQUESTS = Number(process.env.RATE_LIMIT_RECOGNIZE_MAX ?? 30);

// ─── Store ──────────────────────────────────────────────────────────────────

/**
 * In-memory sliding window store.
 * Key: identifier string (IP or user ID)
 * Value: array of timestamps within the current window
 */
const store = new Map<string, RateLimitEntry[]>();

// Periodic cleanup to prevent unbounded memory growth
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanupTimer(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    let cleaned = false;
    for (const [key, entries] of store.entries()) {
      const filtered = entries.filter((e) => now - e.timestamp < WINDOW_MS);
      if (filtered.length === 0) {
        store.delete(key);
        cleaned = true;
      } else if (filtered.length !== entries.length) {
        store.set(key, filtered);
        cleaned = true;
      }
    }
    if (cleaned) {
      // eslint-disable-next-line no-console
      console.debug(`[rate-limiter] Cleaned ${store.size} active keys`);
    }
  }, CLEANUP_INTERVAL_MS);
}

// Start cleanup on module load
startCleanupTimer();

// ─── Core Logic ─────────────────────────────────────────────────────────────

function getLimitForPath(pathname: string): number {
  if (pathname.startsWith('/api/auth/')) return AUTH_MAX_REQUESTS;
  if (pathname.startsWith('/api/camera/recognize')) return RECOGNIZE_MAX_REQUESTS;
  return MAX_REQUESTS;
}

function getLimitForKey(key: RateLimitKey, pathname: string): number {
  // Per-user limits when authenticated
  if (key.identifier.startsWith('user:')) return getLimitForPath(pathname);
  // IP-based limits
  return getLimitForPath(pathname);
}

export function rateLimit(
  key: RateLimitKey,
  pathname: string,
): RateLimitResult {
  const now = Date.now();
  const limit = getLimitForKey(key, pathname);
  const windowStart = now - WINDOW_MS;

  // Get or create entries for this key
  let entries = store.get(key.identifier) ?? [];

  // Filter to current window (sliding window)
  entries = entries.filter((e) => e.timestamp > windowStart);

  const remaining = Math.max(0, limit - entries.length);
  const allowed = entries.length < limit;

  // Calculate reset time: when the oldest entry in the window expires
  const resetAt =
    entries.length > 0
      ? new Date(entries[0].timestamp + WINDOW_MS)
      : new Date(now + WINDOW_MS);

  if (allowed) {
    entries.push({ timestamp: now });
    store.set(key.identifier, entries);
  }

  return {
    allowed,
    limit,
    remaining: allowed ? remaining - 1 : 0,
    resetAt,
    windowMs: WINDOW_MS,
  };
}

/**
 * Extract a rate-limit key from the request.
 * Prioritizes X-Forwarded-For for proxied requests, falls back to remote address.
 */
export function extractRateLimitKey(request: {
  headers: Headers;
  ip?: string | null;
}): RateLimitKey {
  // Check for authenticated user header (set by auth middleware)
  const userId = request.headers.get('x-user-id');
  if (userId) {
    return { identifier: `user:${userId}` };
  }

  // Check forwarded-for headers (behind reverse proxy/load balancer)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // The first IP is the client IP
    const clientIp = forwardedFor.split(',')[0].trim();
    return { identifier: `ip:${clientIp}` };
  }

  // Fall back to direct connection IP
  const ip = request.ip ?? 'unknown';
  return { identifier: `ip:${ip}` };
}

/**
 * Format rate limit headers for Next.js Response.
 */
export function formatRateLimitHeaders(result: RateLimitResult): HeadersInit {
  const resetSeconds = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000);

  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(resetSeconds),
    'Retry-After': result.allowed ? '0' : String(Math.ceil(result.windowMs / 1000)),
  };
}

// ─── Cleanup on shutdown ────────────────────────────────────────────────────

if (typeof process !== 'undefined') {
  process.on('SIGTERM', () => {
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  });
}

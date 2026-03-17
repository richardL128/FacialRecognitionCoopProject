/**
 * Feature flag service with LRU-bounded in-memory caching and observability.
 *
 * Override hierarchy (first match wins):
 *   1. GLOBAL override in Postgres (Platform Support)
 *   2. TENANT override in Postgres (Platform Support)
 *   3. CLIENT override in Postgres (Tenant Admin — only if TENANT allows)
 *   4. External permissions system (see external.ts)
 *   5. Default: enabled (fail-open)
 */

import type { PermissionContext } from './types';
import { externalIsEnabled } from './external';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

const CACHE_TTL_MS = 60_000; // 1 minute
const CACHE_MAX_ENTRIES = 1_000;

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

/**
 * Simple LRU cache: Map preserves insertion order. On access we delete+re-set
 * to move the key to the end. Eviction removes from the front (oldest).
 */
class LruCache<T> {
  private map = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private hits = 0;
  private misses = 0;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: string): T | null {
    const entry = this.map.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      this.misses++;
      return null;
    }
    // Move to end (most recently used)
    this.map.delete(key);
    this.map.set(key, entry);
    this.hits++;
    return entry.data;
  }

  set(key: string, data: T, ttlMs: number): void {
    if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  clear(): void {
    this.map.clear();
    this.hits = 0;
    this.misses = 0;
  }

  get size(): number {
    return this.map.size;
  }

  get stats(): { hits: number; misses: number; size: number; hitRate: string } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.map.size,
      hitRate: total > 0 ? `${((this.hits / total) * 100).toFixed(1)}%` : 'N/A',
    };
  }
}

const flagCache = new LruCache<boolean>(CACHE_MAX_ENTRIES);

function cacheKey(key: string, tenantId: string, clientId?: string): string {
  return `${key}:${tenantId}:${clientId ?? '*'}`;
}

/**
 * Check Postgres for a feature flag override.
 * Returns true/false if an override exists, or null to fall through.
 *
 * Precedence: GLOBAL > TENANT > CLIENT > (fall through)
 * CLIENT overrides are only checked when the TENANT-level is not explicitly disabled.
 */
async function checkOverride(
  key: string,
  tenantId: string,
  clientId?: string,
): Promise<boolean | null> {
  try {
    // 1. GLOBAL override
    const global = await prisma.featureFlagOverride.findFirst({
      where: { flagKey: key, scope: 'GLOBAL', tenantId: null },
      select: { enabled: true },
    });
    if (global) return global.enabled;

    // 2. TENANT override
    const tenant = await prisma.featureFlagOverride.findFirst({
      where: { flagKey: key, scope: 'TENANT', tenantId },
      select: { enabled: true },
    });
    if (tenant) {
      if (!tenant.enabled) return false; // Tenant disabled → CLIENT cannot override
    }

    // 3. CLIENT override (only if tenant didn't disable)
    if (clientId) {
      const client = await prisma.featureFlagOverride.findFirst({
        where: { flagKey: key, scope: 'CLIENT', tenantId, scopeId: clientId },
        select: { enabled: true },
      });
      if (client) return client.enabled;
    }

    if (tenant) return tenant.enabled;
    return null; // No override — fall through
  } catch (error) {
    logger.error(
      { err: error, key, tenantId, clientId },
      'Override check failed — falling through to external system',
    );
    return null;
  }
}

/**
 * Check if a specific feature flag is enabled for the given context.
 *
 * Resolution order:
 *   1. In-memory LRU cache (1-minute TTL)
 *   2. GLOBAL override in Postgres
 *   3. TENANT override in Postgres
 *   4. CLIENT override in Postgres (only if TENANT allows)
 *   5. External permissions system (see external.ts)
 *   6. Default: enabled (fail-open)
 */
export async function isEnabled(key: string, ctx: PermissionContext): Promise<boolean> {
  const cKey = cacheKey(key, ctx.tenantId, ctx.clientId);
  const cached = flagCache.get(cKey);
  if (cached !== null) return cached;

  const startMs = performance.now();
  try {
    // Check Postgres overrides (GLOBAL → TENANT → CLIENT)
    const override = await checkOverride(key, ctx.tenantId, ctx.clientId);
    if (override !== null) {
      flagCache.set(cKey, override, CACHE_TTL_MS);
      logger.debug(
        { key, ...ctx, override, durationMs: Math.round(performance.now() - startMs) },
        'Feature flag resolved via Postgres override',
      );
      return override;
    }

    // Fall through to external permissions system
    const external = await externalIsEnabled(key, ctx.tenantId);
    if (external !== null) {
      flagCache.set(cKey, external, CACHE_TTL_MS);
      return external;
    }

    // Default: enabled (fail-open)
    flagCache.set(cKey, true, CACHE_TTL_MS);
    return true;
  } catch (error) {
    logger.error(
      { err: error, key, ...ctx, durationMs: Math.round(performance.now() - startMs) },
      'Feature flag evaluation failed — defaulting to enabled',
    );
    return true;
  }
}

/** Clear all cached flag data (call after admin changes) */
export function clearCache(): void {
  flagCache.clear();
}

/** Return cache hit/miss statistics for observability */
export function getCacheStats() {
  return flagCache.stats;
}

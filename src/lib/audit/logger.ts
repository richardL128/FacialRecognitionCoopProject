import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import type { Prisma } from '@/generated/prisma/client';

type AuditLogInput = {
  tenantId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  request?: NextRequest;
};

// Add any field names that contain sensitive data and should never appear in
// the audit log in cleartext.
const PII_FIELDS = ['password', 'token', 'secret', 'apiKey', 'accessToken', 'refreshToken'];

/** Mask sensitive fields in audit data: replaces values with '***REDACTED***' */
function maskPii(data: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!data) return null;
  const masked = { ...data };
  for (const field of PII_FIELDS) {
    if (field in masked) {
      masked[field] = '***REDACTED***';
    }
  }
  return masked;
}

/**
 * Write an append-only audit log entry.
 * Every mutation in the app SHOULD call this function.
 *
 * Action naming convention: [domain].[entity].[verb]
 * Examples: 'user.profile.updated', 'tenant.settings.changed', 'feature.flag.enabled'
 */
export async function auditLog(input: AuditLogInput): Promise<void> {
  const { tenantId, userId, action, entityType, entityId, beforeData, afterData, request } = input;

  try {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action,
        entityType,
        entityId,
        beforeData: (maskPii(beforeData) as Prisma.InputJsonValue) ?? undefined,
        afterData: (maskPii(afterData) as Prisma.InputJsonValue) ?? undefined,
        ipAddress: request?.headers.get('x-forwarded-for') ?? request?.headers.get('x-real-ip'),
        userAgent: request?.headers.get('user-agent'),
      },
    });
  } catch (error) {
    // Audit logging must never crash the request — log and continue
    logger.error({ err: error, action, entityType, entityId }, 'Failed to write audit log');
  }
}

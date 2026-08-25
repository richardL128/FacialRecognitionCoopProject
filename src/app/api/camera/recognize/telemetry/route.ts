import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApi } from '@/lib/api/handler';
import { prisma } from '@/lib/db/prisma';
import { canUser } from '@/lib/permissions';
import { apiError, apiSuccess } from '@/types/api';

export const runtime = 'nodejs';

const querySchema = z.object({
  hours: z.coerce.number().int().min(1).max(168).optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
});

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function asNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value !== 'boolean') {
    return null;
  }
  return value;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  return value;
}

function addBucket(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function confidenceBucket(confidence: number): string {
  if (confidence < 0.5) return 'lt_050';
  if (confidence < 0.7) return '050_069';
  if (confidence < 0.8) return '070_079';
  if (confidence < 0.9) return '080_089';
  return 'gte_090';
}

function gapBucket(gap: number): string {
  if (gap < 0.01) return 'lt_001';
  if (gap < 0.03) return '001_029';
  if (gap < 0.05) return '030_049';
  return 'gte_050';
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return Number(sorted[index]!.toFixed(4));
}

export const GET = withApi(
  async (request: NextRequest, { session }) => {
    if (!canUser(session, 'camera:capture:read')) {
      return NextResponse.json(apiError('FORBIDDEN', 'Insufficient permissions'), { status: 403 });
    }

    const parsedQuery = querySchema.safeParse({
      hours: new URL(request.url).searchParams.get('hours') ?? undefined,
      limit: new URL(request.url).searchParams.get('limit') ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        apiError('VALIDATION_ERROR', 'Invalid query parameters', parsedQuery.error.flatten()),
        { status: 400 },
      );
    }

    const hours = parsedQuery.data.hours ?? 24;
    const limit = parsedQuery.data.limit ?? 500;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const rows = await prisma.auditLog.findMany({
      where: {
        tenantId: session.tenantId,
        action: 'CAMERA_CAPTURE_RECOGNIZED',
        createdAt: {
          gte: since,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      select: {
        createdAt: true,
        afterData: true,
      },
    });

    const statusCounts: Record<string, number> = {};
    const algorithmCounts: Record<string, number> = {};
    const providerConfiguredCounts: Record<string, number> = {};
    const providerAttemptedCounts: Record<string, number> = {};
    const fallbackReasonCounts: Record<string, number> = {};
    const confidenceHistogram: Record<string, number> = {};
    const confidenceGapHistogram: Record<string, number> = {};

    let matchedCount = 0;
    let fallbackCount = 0;
    let confidenceCount = 0;
    let confidenceSum = 0;
    let candidatesEvaluatedSum = 0;
    let candidatesEvaluatedCount = 0;

    const confidenceValues: number[] = [];
    const durationValues: number[] = [];
    const confidenceGapValues: number[] = [];

    for (const row of rows) {
      const afterData = asRecord(row.afterData);
      if (!afterData) {
        continue;
      }

      const status = asString(afterData.status) ?? 'unknown';
      addBucket(statusCounts, status);

      const algorithm = asString(afterData.algorithm) ?? 'unknown';
      addBucket(algorithmCounts, algorithm);

      const providerConfigured = asString(afterData.providerConfigured) ?? 'unknown';
      addBucket(providerConfiguredCounts, providerConfigured);

      const fallbackApplied = asBoolean(afterData.fallbackApplied) ?? false;
      if (fallbackApplied) {
        fallbackCount += 1;
      }

      const fallbackReason = asString(afterData.fallbackReason);
      if (fallbackReason) {
        addBucket(fallbackReasonCounts, fallbackReason);
      }

      const matched = asBoolean(afterData.matched) ?? false;
      if (matched) {
        matchedCount += 1;
      }

      const confidence = asNumber(afterData.confidence);
      if (confidence !== null) {
        confidenceCount += 1;
        confidenceSum += confidence;
        confidenceValues.push(confidence);
        addBucket(confidenceHistogram, confidenceBucket(confidence));
      }

      const candidatesEvaluated = asNumber(afterData.candidatesEvaluated);
      if (candidatesEvaluated !== null) {
        candidatesEvaluatedCount += 1;
        candidatesEvaluatedSum += candidatesEvaluated;
      }

      const telemetry = asRecord(afterData.recognitionTelemetry);
      if (telemetry) {
        const providerAttempted = asString(telemetry.providerAttempted) ?? 'unknown';
        addBucket(providerAttemptedCounts, providerAttempted);

        const durationMs = asNumber(telemetry.durationMs);
        if (durationMs !== null) {
          durationValues.push(durationMs);
        }

        const confidenceGap = asNumber(telemetry.confidenceGap);
        if (confidenceGap !== null) {
          confidenceGapValues.push(confidenceGap);
          addBucket(confidenceGapHistogram, gapBucket(confidenceGap));
        }
      }
    }

    const totalEvents = rows.length;
    const matchRate = totalEvents > 0 ? Number((matchedCount / totalEvents).toFixed(4)) : 0;
    const fallbackRate = totalEvents > 0 ? Number((fallbackCount / totalEvents).toFixed(4)) : 0;

    const avgConfidence =
      confidenceCount > 0 ? Number((confidenceSum / confidenceCount).toFixed(4)) : null;
    const avgCandidatesEvaluated =
      candidatesEvaluatedCount > 0
        ? Number((candidatesEvaluatedSum / candidatesEvaluatedCount).toFixed(2))
        : null;

    const avgDurationMs =
      durationValues.length > 0
        ? Number((durationValues.reduce((acc, n) => acc + n, 0) / durationValues.length).toFixed(2))
        : null;

    const avgConfidenceGap =
      confidenceGapValues.length > 0
        ? Number(
            (
              confidenceGapValues.reduce((acc, n) => acc + n, 0) / confidenceGapValues.length
            ).toFixed(4),
          )
        : null;

    return NextResponse.json(
      apiSuccess({
        window: {
          hours,
          limit,
          since,
          until: new Date(),
        },
        totals: {
          events: totalEvents,
          matched: matchedCount,
          fallback: fallbackCount,
          matchRate,
          fallbackRate,
        },
        distributions: {
          statusCounts,
          algorithmCounts,
          providerConfiguredCounts,
          providerAttemptedCounts,
          fallbackReasonCounts,
          confidenceHistogram,
          confidenceGapHistogram,
        },
        metrics: {
          avgConfidence,
          p50Confidence: percentile(confidenceValues, 0.5),
          p90Confidence: percentile(confidenceValues, 0.9),
          p95Confidence: percentile(confidenceValues, 0.95),
          avgDurationMs,
          p95DurationMs: percentile(durationValues, 0.95),
          avgConfidenceGap,
          p50ConfidenceGap: percentile(confidenceGapValues, 0.5),
          p95ConfidenceGap: percentile(confidenceGapValues, 0.95),
          avgCandidatesEvaluated,
        },
      }),
      { status: 200 },
    );
  },
  {
    featureFlag: 'CAMERA_CAPTURE_ENABLED',
  },
);

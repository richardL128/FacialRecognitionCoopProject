# Skill: API Route Patterns

## The Standard Pattern

Every API route uses the `withApi()` wrapper from `src/lib/api/handler.ts`.
The pipeline order is: **Auth → Validate → Permissions → Tenant → DB → Audit → Respond**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApi } from '@/lib/api/handler';
import { prisma } from '@/lib/db/prisma';
import { canUser } from '@/lib/permissions';
import { belongsToTenant } from '@/lib/auth/session';
import { auditLog } from '@/lib/audit/logger';
import { apiSuccess, apiError } from '@/types/api';

const bodySchema = z.object({
  name: z.string().min(1).max(100),
  // ... other fields
});

export const POST = withApi(
  async (request, { session, params }) => {
    // 1. Permission check
    if (!await canUser(session, 'resource:create', { tenantId: session.tenantId })) {
      return NextResponse.json(apiError('FORBIDDEN', 'Insufficient permissions'), { status: 403 });
    }

    // 2. Tenant isolation
    const parent = await prisma.someModel.findUnique({ where: { id: params.id } });
    if (!parent || !belongsToTenant(session, parent.tenantId)) {
      return NextResponse.json(apiError('NOT_FOUND', 'Not found'), { status: 404 });
    }

    // 3. DB mutation
    const result = await prisma.someModel.create({
      data: {
        tenantId: session.tenantId,
        // ... other fields from validated body
      },
    });

    // 4. Audit log
    await auditLog({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'resource.created',
      entityType: 'some_model',
      entityId: result.id,
      afterData: result,
      request,
    });

    return NextResponse.json(apiSuccess(result), { status: 201 });
  },
  { bodySchema }
);
```

## GET (read) Pattern

```typescript
export const GET = withApi(async (_request, { session }) => {
  // Tenant-scoped query — always include tenantId
  const items = await prisma.someModel.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: 'desc' },
    take: 50, // paginate — never return unbounded lists
  });

  return NextResponse.json(apiSuccess(items));
});
```

## Response Types

Always use `apiSuccess()` and `apiError()` from `src/types/api.ts`:

```typescript
// Success
return NextResponse.json(apiSuccess({ id, name }));
return NextResponse.json(apiSuccess(items), { status: 200 });
return NextResponse.json(apiSuccess(created), { status: 201 });

// Error
return NextResponse.json(apiError('NOT_FOUND', 'Resource not found'), { status: 404 });
return NextResponse.json(apiError('VALIDATION_ERROR', 'Invalid input', details), { status: 400 });
```

## Common Status Codes
| Code | Use |
|------|-----|
| 200 | OK — GET, successful update |
| 201 | Created — POST that creates a resource |
| 204 | No Content — DELETE |
| 400 | Bad Request — validation failure |
| 401 | Unauthorized — not authenticated |
| 403 | Forbidden — authenticated but no permission |
| 404 | Not Found — resource missing OR cross-tenant (never 403 for tenant isolation) |
| 409 | Conflict — duplicate key, business rule violation |
| 503 | Service Unavailable — kill switch active |

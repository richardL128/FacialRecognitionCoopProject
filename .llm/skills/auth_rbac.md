# Skill: Auth & RBAC

## Role Hierarchy

> Update this to reflect your actual role structure.

```
PLATFORM_ADMIN      (internal only — full system access)
  └── ADMIN         (organisation-level admin)
        ├── MANAGER (team/functional manager)
        └── USER    (standard user)
  └── VIEWER        (read-only across scope)
```

Update `prisma/schema.prisma` (Role enum) and `src/lib/permissions/index.ts`
(ROLE_HIERARCHY and ROLE_PERMISSIONS) to match your actual roles.

## Permission Check Pattern
```typescript
import { canUser } from '@/lib/permissions';

// In API route — always before DB query
const allowed = await canUser(session, 'resource:action:verb', {
  tenantId: session.tenantId,
});

if (!allowed) {
  return NextResponse.json(apiError('FORBIDDEN', 'Insufficient permissions'), { status: 403 });
}
```

## Permission String Format
`[domain]:[resource]:[action]`
Examples:
- `users:record:create`
- `users:record:read`
- `settings:config:update`
- `reports:export:read`

Add permissions to `src/lib/permissions/index.ts` as you build features.

## Tenant Isolation Check
Always runs AFTER auth, BEFORE permission check:
```typescript
if (!belongsToTenant(session, resource.tenantId)) {
  return NextResponse.json(apiError('NOT_FOUND', 'Not found'), { status: 404 });
  // Return 404 not 403 — don't confirm resource existence across tenants
}
```

## Session Context
The `SessionContext` type in `src/lib/auth/session.ts`:
```typescript
type SessionContext = {
  userId: string;
  externalId: string;  // ID from your identity provider
  tenantId: string;
  role: string;
  email: string;
};
```

## Dev Bypass
`src/lib/auth/session.ts` currently has a **dev bypass** that returns the first
`PLATFORM_ADMIN` user from the database. Replace `getSessionContext()` with
your identity provider integration when ready.

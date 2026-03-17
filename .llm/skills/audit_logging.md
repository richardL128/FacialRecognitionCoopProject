# Skill: Audit Logging

## The Rule
Every mutation in this app MUST produce an audit log entry.
Use `src/lib/audit/logger.ts` — never write to audit_log directly.

## The audit_log Table
```sql
CREATE TABLE audit_log (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID NOT NULL,
  user_id       UUID NOT NULL,
  action        TEXT NOT NULL,      -- e.g. 'resource.created'
  entity_type   TEXT NOT NULL,      -- e.g. 'user'
  entity_id     UUID NOT NULL,
  before_data   JSONB,              -- state before (null for creates)
  after_data    JSONB,              -- state after (null for deletes)
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
REVOKE UPDATE, DELETE ON audit_log FROM app_user;
```

## Action Naming Convention
`[domain].[entity].[verb]`
Examples:
- `user.record.created`
- `user.record.updated`
- `tenant.settings.updated`
- `resource.deleted`
- `ai.query.executed`

## Usage Pattern
```typescript
import { auditLog } from '@/lib/audit/logger';

await auditLog({
  tenantId: session.tenantId,
  userId: session.userId,
  action: 'resource.updated',
  entityType: 'resource',
  entityId: resource.id,
  beforeData: existing,   // always capture before state
  afterData: updated,     // never include sensitive/PII fields
  request,                // for IP + user agent
});
```

## What NOT to Include in Audit Data
- Passwords or tokens
- Encryption keys
- Any field designated as sensitive in your data classification doc
Use masked versions: `field: '***REDACTED***'`

## The append-only guarantee
`db/migrations/audit_log_protection.sql` runs `REVOKE UPDATE, DELETE ON audit_log FROM app_user`.
This is enforced at the database level, not just application level.

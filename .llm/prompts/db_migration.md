# Prompt Template: DB Migration

Use this to ask an LLM to help write a Prisma migration.

---

**Context**:
```
Project: [Your Project Name]
ORM: Prisma 7 with @prisma/adapter-pg
Migration path: db/migrations/
Schema: prisma/schema.prisma
```

**Migration Request**:
```
What changed: [describe the schema change]
Affected models: [list models]
Breaking change: [yes/no — explain if yes]
Data migration needed: [yes/no — describe if yes]
```

**Ask**:
```
Please:
1. Update prisma/schema.prisma with the necessary changes
2. Write any raw SQL needed in db/migrations/ (e.g. RLS policies, REVOKE statements)
3. Note any data migration steps required
4. Confirm soft-delete models still have deletedAt field
```

**Notes**:
- Prisma 7: import from `@/generated/prisma/client` (not `@prisma/client`)
- Prisma 7: use `datasource.url` from prisma.config.ts for CLI; `DATABASE_URL` for client
- Audit log table has `REVOKE UPDATE, DELETE` — never add deletedAt to audit_log

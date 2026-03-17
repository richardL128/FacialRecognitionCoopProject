# Skill: Database Patterns

## Prisma Version Notes (Prisma 7)
- Import from `@/generated/prisma/client` (not `@prisma/client`)
- No `directUrl` — CLI uses `datasource.url` from `prisma.config.ts`
- Use `{ connectionString }` object in `PrismaPg()`, not a `Pool` instance
- Schema output: `output = "../src/generated/prisma"` in generator block

## Prisma Client (src/lib/db/prisma.ts)
Always import from the shared client — never instantiate a new PrismaClient:
```typescript
import { prisma } from '@/lib/db/prisma';
```

The client includes a **soft-delete extension** that:
- Auto-filters `deletedAt: null` on `findMany`, `findFirst`, `findUnique`
- Converts `delete` to `update({ data: { deletedAt: now } })`
- Applies to models listed in `SOFT_DELETE_MODELS`

To add a model to soft delete: add `deletedAt DateTime?` to the schema,
then add the model name to `SOFT_DELETE_MODELS` in `src/lib/db/prisma.ts`.

## Multi-Tenant Queries
Always scope queries to the current tenant:
```typescript
// ✅ Correct — always include tenantId
const items = await prisma.someModel.findMany({
  where: { tenantId: session.tenantId, ...otherFilters },
});

// ❌ Wrong — no tenant scoping
const items = await prisma.someModel.findMany();
```

## Transactions
Multi-step mutations must use transactions:
```typescript
const result = await prisma.$transaction(async (tx) => {
  const a = await tx.modelA.create({ data: { ... } });
  const b = await tx.modelB.create({ data: { relatedId: a.id, ... } });
  return { a, b };
});
```

## Standard Model Fields
Every entity model should have:
```prisma
model MyEntity {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String    @map("tenant_id") @db.Uuid
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")  // for soft delete

  @@index([tenantId])
  @@map("my_entities")  // snake_case table names
}
```

## Migrations
- Schema migrations: `npm run db:migrate`
- Raw SQL (e.g. RLS, REVOKE): place in `db/migrations/` and apply manually
- Production: `DATABASE_URL=<prod_url> npx prisma migrate deploy`

## Sensitive Field Encryption
Implement `src/lib/encryption/` before storing any PII.
Store encrypted values as `String` with an `Encrypted` suffix:
```prisma
sensitiveFieldEncrypted String? @map("sensitive_field_encrypted")
```
Never store the raw value — encrypt before write, decrypt after read.

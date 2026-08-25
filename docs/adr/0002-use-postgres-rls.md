# ADR-0002: Use PostgreSQL with Row-Level Security

**Date:** YYYY-MM-DD
**Status:** Accepted

## Context
We need a database strategy that enforces multi-tenant data isolation
reliably and prevents cross-tenant data leaks even in the case of
application-level bugs.

## Decision
Use PostgreSQL with Row-Level Security (RLS) policies, managed via Prisma.

## Rationale
- RLS enforces tenant isolation at the database level — a second line of defence
  after the application-level `tenantId` checks
- PostgreSQL is mature, widely supported, and integrates well with Prisma
- Soft delete via `deletedAt` avoids data loss while keeping query semantics simple
- Audit log with `REVOKE UPDATE, DELETE` provides an immutable history

## Alternatives Considered
- **Separate databases per tenant:** Too costly to operate at scale; complex migrations
- **MySQL:** Lacks RLS; weaker JSON support for audit data

## Consequences
- RLS policies must be written as raw SQL in `db/migrations/`
- Prisma must use the app role (not superuser) for all queries
- `REVOKE UPDATE, DELETE ON audit_log` must be applied after initial migration

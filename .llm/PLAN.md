# Project Plan

## How to Use This File
At the start of every session, read this file to understand
what to build next. Update task status as work completes.
Always read PROGRESS.md first to understand what's already done.

## Status Legend
- [ ] Not started
- [~] In progress
- [x] Complete
- [!] Blocked — reason noted

---

## Phase 1 — Foundation ✅ (scaffold provided)
- [x] Project scaffold + .llm docs
- [x] Next.js App Router + TypeScript + Tailwind + KendoReact
- [x] ESLint + Prettier configured
- [x] Prisma + PostgreSQL connection
- [x] Tenant isolation middleware
- [x] Pino structured logging with PII redaction
- [x] AppError class + ApiResponse<T> type
- [x] withApi() handler wrapper (auth → validate → permissions → tenant → db → audit)
- [x] Soft delete middleware (Prisma extension)
- [x] Audit log table + logger utility (append-only)
- [x] canUser() permissions helper skeleton
- [x] Feature flag system (3-tier: global / tenant / client)
- [x] Dashboard tile layout with persistence
- [x] App shell (header, navigation)
- [x] Placeholder pages
- [x] Kill switch middleware
- [x] Docker + docker-compose

## Phase 2 — Auth + Identity
> Integrate your identity provider here.
- [ ] Connect to identity provider (replace dev bypass in `src/lib/auth/session.ts`)
- [ ] Login / logout pages — integrate IdP flow
- [ ] MFA enforcement (if required)
- [ ] User invitation flow
- [ ] Role assignment on user creation
- [ ] Tenant isolation verified with integration test
- [ ] Session + tenantContext available in all API routes

## Phase 3 — [Your First Feature]
> Replace this phase with your first real feature set.
- [ ] [Feature A] — list page (KendoReact Grid)
- [ ] [Feature A] — add / edit form
- [ ] [Feature A] — detail page
- [ ] [Feature A] — audit log entries

## Phase 4 — [Your Second Feature]
- [ ] [Feature B] — [describe tasks]

## Phase 5 — [Additional Features]
- [ ] [Describe phases for your product roadmap]

## Phase 6 — AI Features (if applicable)
- [ ] AI client wrapper (lib/ai/client.ts)
- [ ] PII redaction layer (lib/ai/redactPII.ts)
- [ ] [AI-powered feature 1]
- [ ] Per-user token usage tracking

## Phase 7 — Hardening
- [ ] Rate limiting
- [ ] Full RBAC audit (every route checked)
- [ ] Penetration test checklist
- [ ] Performance test with realistic data volumes
- [ ] Health check endpoint
- [ ] Runbooks written (deploy, rollback, incident)

---

## Current Focus
**Phase 2 — Auth + Identity**
Next task: Connect identity provider in `src/lib/auth/session.ts`

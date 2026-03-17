# Architecture

> **Scaffold note:** This file documents the patterns and directory structure baked into the scaffold.
> Update Section 4 (Project Structure) and Section 5 (Route Map) once you start building features.

---

## 1. Overview

This is a **Next.js App Router** monolith with:
- **Frontend:** React Server Components + KendoReact
- **Backend:** Next.js API Routes (no separate backend service required at this scale)
- **Database:** PostgreSQL via Prisma
- **Auth:** Configured in `src/lib/auth/session.ts` — integrate your identity provider there

---

## 2. Data Flow

```
Browser → Next.js Middleware (kill switches)
       → Server Components (data fetch via lib/)
       → API Routes (mutations via withApi() wrapper)
       → Prisma (PostgreSQL)
       → Audit Log (append-only)
```

**Every API route follows this pipeline (enforced by `withApi()`):**
```
Auth → Validate (Zod) → Permissions → Tenant Isolation → DB query → Audit Log → Response
```

---

## 3. Directory Structure

```
payevo-base/
├── public/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── layout.tsx              # Root layout
│   │   ├── page.tsx                # Root redirect → /dashboard
│   │   ├── (auth)/                 # Auth routes (login, logout)
│   │   ├── (dashboard)/            # Authenticated app routes
│   │   │   ├── layout.tsx          # Dashboard shell (header, nav)
│   │   │   ├── dashboard/
│   │   │   ├── [feature-a]/        # Replace with your features
│   │   │   ├── [feature-b]/
│   │   │   └── settings/
│   │   ├── api/                    # API routes
│   │   │   ├── auth/me/            # Current user session
│   │   │   ├── dashboard/layout/   # Dashboard tile persistence
│   │   │   ├── permissions/flags/  # Client-side permission check
│   │   │   ├── settings/feature-flags/  # Feature flag management
│   │   │   └── support/feature-flags/   # Support overrides
│   │   ├── feature-unavailable/    # Kill switch landing page
│   │   └── support/                # Internal support tools
│   ├── components/
│   │   ├── dashboard/              # Dashboard tile components
│   │   │   └── tiles/              # Individual tile components
│   │   ├── layout/                 # AppShell, Header, Sidebar, SubnavShards
│   │   ├── settings/               # Feature flag settings UI
│   │   ├── support/                # Internal support admin UI
│   │   └── ui/                     # Generic reusable UI (FeatureGate, etc.)
│   ├── constants/
│   │   ├── dashboardLayouts.ts     # Role-based dashboard tile defaults
│   │   └── featureFlagCatalog.ts   # All feature flag definitions
│   ├── hooks/
│   │   ├── useCurrentUser.ts       # Current session user
│   │   ├── useDashboardLayout.ts   # Dashboard tile layout persistence
│   │   ├── useFeatureFlag.ts       # Single flag check
│   │   ├── useFeatureFlags.ts      # Multiple flags check
│   │   └── usePermissionKeys.ts    # User's permission keys
│   ├── lib/
│   │   ├── api/handler.ts          # withApi() middleware wrapper
│   │   ├── audit/logger.ts         # Append-only audit log writer
│   │   ├── auth/session.ts         # Session resolution (integrate your IdP here)
│   │   ├── db/prisma.ts            # Prisma client (with soft-delete extension)
│   │   ├── errors.ts               # AppError class
│   │   ├── feature-flags/          # Feature flag service + repository
│   │   ├── logger.ts               # Pino structured logger (PII redaction)
│   │   └── permissions/index.ts    # canUser() RBAC helper
│   ├── styles/
│   │   ├── globals.css             # Tailwind + Kendo + PayEvo design system
│   │   ├── payevo-design-system.css  # Design tokens (colours, typography)
│   │   └── payevo-kendo-theme.css  # Kendo component theme overrides
│   └── types/
│       └── api.ts                  # ApiResponse<T>, apiSuccess(), apiError()
├── prisma/
│   └── schema.prisma               # Database schema
├── db/
│   ├── migrations/                 # Raw SQL migrations (e.g. audit protection)
│   └── seeds/index.ts              # Seed data script
├── docs/
│   ├── adr/                        # Architecture Decision Records
│   ├── runbooks/                   # Operational runbooks
│   └── security/                   # Threat model, data classification
└── .llm/                           # LLM documentation system
    ├── PROJECT.md
    ├── ARCHITECTURE.md (this file)
    ├── CONVENTIONS.md
    ├── DOMAIN_GLOSSARY.md
    ├── PLAN.md
    ├── PROGRESS.md
    ├── prompts/
    ├── skills/
    └── tuning/
```

---

## 4. Key Patterns

### API Route Pattern (`withApi()`)
All API mutations use the `withApi()` wrapper in `src/lib/api/handler.ts`.
Options: `bodySchema` (Zod), `querySchema` (Zod), `featureFlag` (string key).

```typescript
export const POST = withApi(
  async (request, { session, params }) => {
    // 1. canUser() check
    // 2. belongsToTenant() check
    // 3. DB mutation
    // 4. auditLog()
    return NextResponse.json(apiSuccess(result));
  },
  { bodySchema: myZodSchema }
);
```

### Soft Delete
`Tenant`, `User`, and any core entities have `deletedAt DateTime?`.
The Prisma extension in `src/lib/db/prisma.ts` auto-filters soft-deleted records.

### Feature Flags
Three-tier flag system: `GLOBAL` → `TENANT` → `CLIENT`.
- Consumer: `useFeatureFlag('flag:key')` in Client Components
- Server: `featureFlags.isEnabled('flag:key', { tenantId })` in API routes
- Gate: `<FeatureGate flag="flag:key">` for conditional rendering

### Tenant Isolation
Every DB query for tenant-scoped data must include `tenantId` in the `where` clause.
Use `belongsToTenant(session, resourceTenantId)` before returning any resource.
Return 404 (not 403) on cross-tenant access — never confirm resource existence.

---

## 5. Route Map

> Update this table as you add routes.

| Route | Auth Required | Feature Flag | Notes |
|-------|:---:|:---:|-------|
| `/` | No | — | Redirects to `/dashboard` |
| `/login` | No | — | Integrate your IdP |
| `/logout` | No | — | Integrate your IdP |
| `/dashboard` | Yes | — | Main dashboard (TileLayout) |
| `/settings` | Yes | — | App settings |
| `/feature-unavailable` | No | — | Kill switch landing |
| `/support/feature-flags` | Yes | — | Internal support tool |

---

## 6. Environment Variables

See `.env.example` for the full list.
Key variables:
- `DATABASE_URL` — PostgreSQL connection string
- `ENCRYPTION_KEY` — 32-byte hex for column-level encryption (implement when needed)
- `KILL_SWITCH_*` — Set to `"true"` to instantly disable a route without a deploy

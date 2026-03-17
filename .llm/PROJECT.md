# Project Overview — [Your Project Name]

> **Scaffold note:** Replace this file with your project's actual details.
> Delete or update every section below to reflect your system.

## What This App Does
[Describe your application here — what problem it solves, who uses it.]

Example:
> A multi-tenant SaaS platform serving [user type A] and [user type B].

## Core Capabilities
- [ ] Feature 1 — [description]
- [ ] Feature 2 — [description]
- [ ] Feature 3 — [description]
- Multi-tenant with firm-level data isolation
- Role-based access control (RBAC)
- Immutable audit trails on every action
- User-configurable dashboards (KendoReact TileLayout)
- Feature flag system for controlled rollouts

## Tech Stack
- **Frontend/Backend:** Next.js 16+ (App Router), TypeScript
- **UI Components:** KendoReact (grids, charts, forms, TileLayout)
- **Database:** PostgreSQL with Row-Level Security (RLS)
- **ORM:** Prisma
- **Auth:** [Your auth provider — e.g. PayEvo Identity Server, Clerk, Auth0]
- **AI:** [Optional — Anthropic Claude API, server-side only]
- **Hosting:** [Your hosting — e.g. Azure Container Apps, Vercel, Railway]
- **Storage:** [Your storage — e.g. AWS S3 with presigned URLs]

## Target Users / Roles
| Role | Description |
|------|-------------|
| `PLATFORM_ADMIN` | Internal platform administrator |
| `ADMIN` | Organisation-level administrator |
| `MANAGER` | Team/department manager |
| `USER` | Standard application user |
| `VIEWER` | Read-only access |

> Update roles in `prisma/schema.prisma` and `src/lib/permissions/index.ts`.

## Non-Negotiable Constraints
1. Audit log is append-only — no UPDATE or DELETE, ever
2. Every API route enforces tenant isolation before any DB query
3. [Add your own security constraints here]
4. [e.g. MFA mandatory for admin roles]
5. [e.g. No permanent public URLs for sensitive documents]

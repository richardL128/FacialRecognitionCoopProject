# [Your Project Name] — Base Scaffold

This is the **PayEvo-Base** scaffolding template. Copy and customise this repo to start a new project with all standards pre-configured.

## Quick Start
```bash
cp .env.example .env.local
# Fill in .env.local values

npm install
npx prisma migrate dev
npm run dev
```

## What's Included
- Next.js 16+ (App Router) with TypeScript strict mode
- KendoReact UI component library
- PostgreSQL + Prisma ORM with soft-delete and audit trail
- Feature flag system (3-tier: global / tenant / client)
- Role-based access control (RBAC) with tenant isolation
- Structured logging (Pino) with PII redaction
- Docker + docker-compose for local dev
- LLM documentation system (`.llm/`) for AI-assisted development

## Key Docs
| Doc | Purpose |
|-----|---------|
| `.llm/PROJECT.md` | Project overview, stack, constraints |
| `.llm/ARCHITECTURE.md` | Directory structure, data flow patterns |
| `.llm/CONVENTIONS.md` | Code rules — read before writing any code |
| `.llm/DOMAIN_GLOSSARY.md` | Canonical terminology |
| `.llm/tuning/` | LLM-specific instructions (Claude, Cursor, Copilot) |
| `.llm/skills/` | Domain skill docs for AI-assisted coding |
| `.llm/prompts/` | Reusable prompt templates |
| `.legacy/` | Previous version reference docs, schema, decisions |
| `docs/adr/` | Architecture Decision Records |
| `docs/security/` | Threat model, data classification |
| `docs/runbooks/` | Deploy, rollback, incident response |

## LLM-Assisted Development
See `.llm/tuning/` for instructions tailored to each AI tool.
Always start a new AI conversation by referencing `.llm/PROJECT.md` and `.llm/CONVENTIONS.md`.

## Customising This Scaffold
1. Update `.llm/PROJECT.md` with your project details
2. Update `.llm/DOMAIN_GLOSSARY.md` with your domain terms
3. Update `package.json` name field
4. Update `src/app/layout.tsx` metadata
5. Add your roles to `prisma/schema.prisma` and `src/lib/permissions/index.ts`
6. Replace placeholder pages in `src/app/(dashboard)/` with real features
7. Fill in `.llm/PLAN.md` with your phased roadmap

## Security Notes
- Never commit `.env.local`
- Sensitive fields are column-encrypted — implement `lib/encryption/` before handling PII
- Audit log is append-only — `UPDATE`/`DELETE` revoked at DB level
- All AI/LLM API calls must be server-side only

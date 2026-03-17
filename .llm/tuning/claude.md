# Claude-Specific Instructions

## How to Use Claude on This Project

### Starting a New Feature
Paste this at the start of your conversation:
```
Read the following project docs before helping me:
- .llm/PROJECT.md (project overview)
- .llm/ARCHITECTURE.md (structure + patterns)
- .llm/CONVENTIONS.md (code rules)
- .llm/DOMAIN_GLOSSARY.md (terminology)
- .llm/skills/[relevant-skill].md

I'm working on: [describe the feature]
```

### Asking Claude to Write Code
Always specify:
- Which layer (API route, component, lib utility, DB migration)
- Whether it's a server or client component
- Whether it involves sensitive data (triggers encryption + audit requirements)

### AI API Usage (within the app itself)
If your app uses an AI API:
- All calls go through a single wrapper (e.g. `src/lib/ai/client.ts`)
- Always describe what PII is involved so redaction can be confirmed
- Log token usage if billing tracking is needed

## Reminders for Claude
- Always suggest audit logging on mutations
- KendoReact components need "use client" directive
- Multi-tenancy: every query needs tenantId scoping
- Return 404 (not 403) on cross-tenant access
- TypeScript strict mode: no `any` types ever

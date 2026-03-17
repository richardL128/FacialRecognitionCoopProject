# Prompt Template: New Feature

Use this prompt when asking any LLM to help build a new feature.

---

**Context** (paste at start of conversation):
```
Project: [Your Project Name] (Next.js App Router, KendoReact, PostgreSQL, Prisma)
Docs to follow:
- .llm/PROJECT.md
- .llm/ARCHITECTURE.md
- .llm/CONVENTIONS.md
- .llm/DOMAIN_GLOSSARY.md
- .llm/skills/[relevant skill]

Check .legacy/v1-docs/ to see if this feature existed in a previous version.
```

**Feature Request**:
```
Feature: [name]
Description: [what it does]
User role(s) affected: [ADMIN / MANAGER / USER / etc]
Sensitive data involved: [yes/no — list fields]
Needs audit logging: [yes — all mutations do]
```

**Ask**:
```
Please:
1. Identify which files/directories this touches per ARCHITECTURE.md
2. Write the Zod validation schema first
3. Write the API route (following the Auth→Validate→Permissions→Tenant→DB→Audit pattern)
4. Write the Server Component (data fetching)
5. Write the Client Component (KendoReact UI with "use client")
6. List any DB migration needed
```

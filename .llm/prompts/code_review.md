# Prompt Template: Code Review

Use this to ask an LLM to review code before merging.

---

```
Review this code for a multi-tenant web application. Check for:

SECURITY
- [ ] No API keys or secrets in client-side code
- [ ] No sensitive/PII data in logs or URLs
- [ ] Tenant isolation enforced (tenantId checked before every query)
- [ ] Permission check present (canUser() called)
- [ ] Input validated with Zod

AUDIT
- [ ] Audit log entry written for every mutation
- [ ] Before/after data captured (without sensitive fields)

DATA
- [ ] Sensitive fields encrypted via lib/encryption/ (if applicable)
- [ ] No raw SQL (use Prisma / lib/db/ helpers)
- [ ] Transactions used for multi-step writes

NEXT.JS PATTERNS
- [ ] KendoReact components have "use client"
- [ ] No browser APIs in Server Components
- [ ] Data fetching in Server Components, not Client Components

CODE QUALITY
- [ ] No `any` types
- [ ] Domain terms match DOMAIN_GLOSSARY.md
- [ ] Follows CONVENTIONS.md

[paste code here]
```

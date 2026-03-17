# General Rules for All LLM Assistants

When helping with this project, always follow these rules:

## Always Do
- Read `.llm/PROJECT.md` for context before suggesting any code
- Read `.llm/CONVENTIONS.md` before writing any code
- Use the domain terms in `.llm/DOMAIN_GLOSSARY.md` exactly
- Follow the API route pattern: Auth → Validate → Permissions → Tenant → DB → Audit → Respond
- Add audit logging to every mutation
- Use TypeScript strict types — never use `any`
- Check `.legacy/` docs when rebuilding existing features

## Never Do
- Write raw SQL in components or API routes
- Suggest client-side API key usage
- Skip permission or tenant checks in API routes
- Use `console.log` with sensitive/PII fields
- Suggest `localStorage` for anything security-related
- Use `any` types in TypeScript
- Skip Zod validation on API inputs
- Return 403 on cross-tenant access (use 404 instead)

## When Suggesting New Features
1. Check `.legacy/v1-docs/` to see if this existed in a previous version
2. Check `.llm/ARCHITECTURE.md` for where the code should live
3. Check `.llm/skills/` for patterns specific to that domain
4. Write the Zod schema first, then the API route, then the component
5. Add the feature flag to the catalog if the feature needs a toggle

## Security Checklist (run mentally before every suggestion)
- [ ] Does this expose data across tenants?
- [ ] Is sensitive data encrypted?
- [ ] Is there an audit log entry?
- [ ] Are permissions checked?
- [ ] Could this leak PII to logs, URLs, or client-side?
- [ ] Is AI/LLM usage server-side only with PII redacted?

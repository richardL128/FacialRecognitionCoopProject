# GitHub Copilot Instructions

## Setup
Create a `.github/copilot-instructions.md` file at the project root with the contents
of `.llm/tuning/general_rules.md` so Copilot automatically applies them to all suggestions.

Alternatively, create `.github/copilot-instructions.md` that references this file:
```md
<!-- See .llm/tuning/general_rules.md for full instructions -->
```
Then paste the general_rules.md content directly.

## Copilot Tips for This Project
- Reference `.llm/CONVENTIONS.md` in your chat when asking for code
- Use `#file:.llm/ARCHITECTURE.md` in Copilot Chat to include architecture context
- Use `#file:.llm/DOMAIN_GLOSSARY.md` to keep terminology consistent
- Always review Copilot suggestions against the API route pattern in ARCHITECTURE.md

## Common Copilot Patterns
When generating API routes, prompt with:
```
Generate a Next.js API route following the withApi() pattern from src/lib/api/handler.ts
with Zod validation, permission check, tenant isolation, DB query, and audit log.
```

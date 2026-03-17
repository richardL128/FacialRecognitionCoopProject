# Code Conventions

## TypeScript
- Strict mode enabled — no `any` types, ever
- All API responses typed with Zod schemas
- Enums in `src/constants/` not inline strings

## File Naming
- Components: PascalCase (`UserGrid.tsx`)
- Utilities/lib: camelCase (`auditLogger.ts`)
- API routes: Next.js convention (`route.ts`)
- DB migrations: sequential prefix (`0001_init_tenants.sql`)

## Component Rules
- Every KendoReact file must start with `"use client"`
- Server Components: no useState, no event handlers, no browser APIs
- Client Components: keep them thin — fetch in server, pass via props

## API Route Pattern
Every API route must follow this order:
1. Authenticate session (identity provider)
2. Validate input (Zod)
3. Check permissions (canUser())
4. Enforce tenant isolation
5. Execute DB query
6. Write audit log
7. Return response

## Database Rules
- Never write raw SQL in components or API routes — use lib/db/ helpers
- Never bypass RLS by using a superuser connection in app code
- Every mutation must have a corresponding audit log entry
- Use transactions for any multi-step write operation

## Sensitive Data Rules
- Never log PII (personally identifiable information) to console or application logs
- Always use lib/encryption/ for encrypt/decrypt of sensitive fields
- Never include sensitive fields in URL params or query strings

## AI / LLM Rules (if using AI features)
- All AI/LLM calls go through a single client wrapper (e.g. `lib/ai/client.ts`)
- PII redaction runs before every API call
- Every AI call is logged to the audit trail
- Never call AI APIs from client-side code

## Import Order (enforced by ESLint)
1. React / Next.js
2. Third-party libraries
3. Internal lib/
4. Components
5. Types
6. Styles

---

## Standing Standards
These apply to every piece of code written in this project, without exception.
No feature is complete until it satisfies all of these.

---

### UX
- Follow progressive disclosure — show only what the user needs at each step
- Every destructive action requires a confirmation dialog
- Empty states must be meaningful — explain why it's empty and what to do next
- Loading states on every async operation — never leave the user guessing
- Toast notifications for all mutations (success + error)
- Forms must preserve input on validation failure — never wipe what the user typed
- Tables must remember sort/filter/page state when navigating back

### Security
- Auth → Validate → Permissions → Tenant → DB → Audit on every API route, always
- No sensitive data in URLs, logs, or client-side state
- All AI/LLM calls server-side only — never from the browser
- Presigned storage URLs only — no permanent public document links
- Input sanitized before any DB write
- Tenant isolation check before every query — return 404 (not 403) on cross-tenant access

### Performance
- **Perceived performance is the priority** — skeleton screens over spinners where possible
- Optimistic UI updates on mutations — don't wait for server confirmation for visual feedback
- KendoReact Grid virtual scrolling enabled for any list over 50 rows
- Images: Next.js `<Image>` component always, never raw `<img>`
- Prefetch route data for predictable navigation
- Avoid waterfalls — parallel fetch where data is independent
- Bundle size: no full library imports (`import { x } from 'lib'`, never `import 'lib'`)

### Efficiency
- Batch related API calls — never make sequential calls when parallel works
- Paginate all list endpoints — no unbounded queries
- Select only the columns you need from the DB — never `SELECT *`
- Prefetch the next likely page/data when the user's intent is clear

### Accessibility (a11y)
- WCAG 2.1 AA minimum — non-negotiable
- All interactive elements keyboard navigable
- All images have meaningful alt text (or `alt=""` if decorative)
